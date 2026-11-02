import express, { Router } from 'express';
import ingestController from '../controllers/biometric-ingest.controller';

const router = Router();

// Raw text so JSON, CSV, ADMS lines and XML all reach the parser untouched.
const rawBody = express.text({ type: '*/*', limit: '5mb' });

// Public by design: the token in the URL (or x-ingest-token header) identifies and authorises the device.
router.post('/ingest/:token', rawBody, ingestController.receive.bind(ingestController));
router.get('/ingest/:token', ingestController.receive.bind(ingestController));
router.post('/ingest', rawBody, ingestController.receive.bind(ingestController));

export default router;
