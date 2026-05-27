import { IDeviceAdapter } from './base.adapter';
import { ESSLAdapter } from './essl.adapter';
import { ZKTecoAdapter } from './zkteco.adapter';

export function getDeviceAdapter(brand: string): IDeviceAdapter {
    switch ((brand || '').toLowerCase()) {
        case 'essl':
        case 'essl_adms':
            return new ESSLAdapter();
        case 'zkteco':
        case 'zkbiosecurity':
            return new ZKTecoAdapter();
        default:
            return new ESSLAdapter(); // generic fallback
    }
}
