jest.mock('../../db', () => ({
  DB: {
    query: jest.fn(),
  },
}));

jest.mock('../../config', () => ({
  APP_NAME: 'PolicyDiff',
  EMAIL_FROM: 'PolicyDiff <support@policydiff.org>',
  RESEND_API_KEY: 'test-resend-key',
}));

import { DB } from '../../db';
import { notifyPolicyChangeIfNeeded, setEmailClientForTests } from '../notification.service';

describe('NotificationService', () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (DB.query as jest.Mock).mockResolvedValue({ rows: [{ email: 'user@example.com' }] });
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    setEmailClientForTests({
      emails: {
        send: mockSend,
      },
    });
  });

  afterEach(() => {
    setEmailClientForTests(null);
  });

  test('should send email when changes are detected', async () => {
    await notifyPolicyChangeIfNeeded(1, 'https://example.com/privacy', {
      message: 'Changes detected',
      risk_level: 'HIGH',
      changes: [{ section: 'Data Sharing', type: 'ADDED', risk: 'HIGH', reason: 'New data sharing text' }],
    });

    expect(DB.query).toHaveBeenCalledWith('SELECT email FROM api_keys WHERE id = $1 AND is_active = TRUE', [1]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      to: 'user@example.com',
      subject: 'PolicyDiff detected a policy change',
    });
  });

  test.each(['No meaningful change detected', 'First snapshot stored'])(
    'should not send email for "%s"',
    async (message) => {
      await notifyPolicyChangeIfNeeded(1, 'https://example.com/privacy', { message });

      expect(DB.query).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    },
  );
});
