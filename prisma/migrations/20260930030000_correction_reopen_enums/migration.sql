-- PostgreSQL requires new enum values to be committed before a later migration
-- can use them in constraints or rows.
ALTER TYPE "InformationEventAction" ADD VALUE 'REOPENED';
ALTER TYPE "PhotoEventAction" ADD VALUE 'REOPENED';
