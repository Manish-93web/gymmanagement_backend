import express, { Router } from 'express';
import esslAdmsController from '../controllers/essl-adms.controller';

const router = Router();

// Use text body parser for this router — eSSL device pushes plain-text ATTLOG
router.use(express.text({ type: '*/*', limit: '1mb' }));

router.get('/iclock/cdata', esslAdmsController.heartbeat.bind(esslAdmsController));
router.post('/iclock/cdata', esslAdmsController.receiveData.bind(esslAdmsController));
router.get('/iclock/getrequest', esslAdmsController.getRequest.bind(esslAdmsController));
router.post('/iclock/devicecmd', esslAdmsController.deviceCmd.bind(esslAdmsController));

export default router;
