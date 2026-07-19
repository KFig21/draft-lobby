import cors from 'cors';
import express from 'express';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { lobbiesRouter } from './routes/lobbies.js';
import { draftRouter } from './routes/draft.js';
import { socialRouter } from './routes/social.js';
import { feedRouter } from './routes/feed.js';

const app = express();

app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/lobbies', lobbiesRouter);
app.use('/api/lobbies', draftRouter);
app.use('/api/friends', socialRouter);
app.use('/api/feed', feedRouter);

app.listen(env.PORT, () => {
  console.log(`⚡ draft-lobby server listening on http://localhost:${env.PORT}`);
});
