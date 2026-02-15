import app from './app';
import { PORT, HOST } from './config';
import { initDB } from './db';

const start = async () => {
  try {
    await initDB();
    await app.listen({ port: PORT, host: HOST });
    console.log(`Server listening on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
