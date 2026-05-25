import express, { Router } from 'express';
import esslAdmsController from '../controllers/essl-adms.controller';

const router = Router();

// Scoped text parser — only applied per-route so it does NOT corrupt JSON bodies
// for other API routes that share the '/' mount prefix.
const esslText = express.text({ type: '*/*', limit: '1mb' });

router.get('/iclock/cdata', esslText, esslAdmsController.heartbeat.bind(esslAdmsController));
router.post('/iclock/cdata', esslText, esslAdmsController.receiveData.bind(esslAdmsController));
router.get('/iclock/getrequest', esslText, esslAdmsController.getRequest.bind(esslAdmsController));
router.post('/iclock/devicecmd', esslText, esslAdmsController.deviceCmd.bind(esslAdmsController));

export default router;
