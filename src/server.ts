import app from './app';
import { PORT, HOST } from './config';
import { initDB } from './db';
import { initializeJobService } from './services/monitorJob.service';

const start = async () => {
  try {
    await initDB();

    // Mark any orphaned PROCESSING jobs as FAILED from previous server instance
    await initializeJobService(app.log);

    await app.listen({ port: PORT, host: HOST });
    app.log.info({ port: PORT, host: HOST }, 'Server started');
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }
};

start();
