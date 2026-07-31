import * as Sentry from "@sentry/node";
import 'dotenv/config';

Sentry.init({
    dsn: process.env.SENTRY_DSN
});