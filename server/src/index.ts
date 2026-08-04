import cors from 'cors';
import express from 'express';
import { env } from './env.js';
import { startDraftEngine } from './draftEngine.js';
import { authRouter } from './routes/auth.js';
import { lobbiesRouter } from './routes/lobbies.js';
import { draftRouter } from './routes/draft.js';
import { socialRouter, publicSocialRouter } from './routes/social.js';
import { feedRouter } from './routes/feed.js';
import { usersRouter } from './routes/users.js';
import { rulesetsRouter } from './routes/rulesets.js';

const app = express();

// Behind Railway's proxy — trust one hop so req.ip is the real client address
// (used by the IP-keyed rate limiter on public routes) rather than the proxy's.
app.set('trust proxy', 1);

app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/lobbies', lobbiesRouter);
app.use('/api/lobbies', draftRouter);
// Public invite-resolve route first, then the authed friend routes — an
// unmatched request (everything but GET /invite/:token) falls through.
app.use('/api/friends', publicSocialRouter);
app.use('/api/friends', socialRouter);
app.use('/api/feed', feedRouter);
app.use('/api/users', usersRouter);
app.use('/api/rulesets', rulesetsRouter);

app.listen(env.PORT, () => {
  console.log(`⚡ draft-lobby server listening on http://localhost:${env.PORT}`);
  startDraftEngine();
});
