export const PLATFORM = {
  Config: Symbol('Config'),
  Clock: Symbol('Clock'),
  Database: Symbol('Database'),
  UnitOfWork: Symbol('UnitOfWork'),
  EventRecorder: Symbol('EventRecorder'),
  Redis: Symbol('Redis'),
  RateLimiter: Symbol('RateLimiter'),
  Logger: Symbol('Logger'),
  ErrorReporter: Symbol('ErrorReporter'),
  JobLock: Symbol('JobLock'),
  EmailSender: Symbol('EmailSender'),
} as const;
