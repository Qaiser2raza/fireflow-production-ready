import { IOrderService } from './IOrderService';
import { DineInService } from './DineInService';
import { TakeawayService } from './TakeawayService';
import { DeliveryService } from './DeliveryService';
import { ReservationService } from './ReservationService';

export class OrderServiceFactory {
    static getService(type: string): IOrderService {
        switch (type) {
            case 'DINE_IN':
                return new DineInService();
            case 'TAKEAWAY':
                return new TakeawayService();
            case 'DELIVERY':
                return new DeliveryService();
            case 'RESERVATION':
                return new ReservationService();
            default:
                throw new Error(`Unsupported order type: ${type}`);
        }
    }
}
