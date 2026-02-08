import app from './app';
import { PORT, HOST } from './config';

const start = async () => {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Server listening on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
