import { bookingService } from '../service';

describe('BookingService', () => {
  describe('calculatePrice', () => {
    it('should calculate flat price correctly', () => {
      const price = bookingService.calculatePrice(
        'FLAT',
        null,
        null,
        100.0,
        null,
        null
      );
      expect(price).toBe(100.0);
    });

    it('should calculate per-kg price correctly', () => {
      const price = bookingService.calculatePrice(
        'PER_KG',
        5.0,
        null,
        null,
        10.0,
        null
      );
      expect(price).toBe(50.0);
    });

    it('should calculate per-item price correctly', () => {
      const price = bookingService.calculatePrice(
        'PER_ITEM',
        null,
        2.5,
        null,
        null,
        4
      );
      expect(price).toBe(10.0);
    });

    it('should throw error for flat pricing without flatPrice', () => {
      expect(() => {
        bookingService.calculatePrice(
          'FLAT',
          null,
          null,
          null,
          null,
          null
        );
      }).toThrow('Flat price is not set');
    });

    it('should throw error for per-kg pricing without required values', () => {
      expect(() => {
        bookingService.calculatePrice(
          'PER_KG',
          null,
          null,
          null,
          10.0,
          null
        );
      }).toThrow('Price per kg and weight are required');
    });

    it('should throw error for per-item pricing without required values', () => {
      expect(() => {
        bookingService.calculatePrice(
          'PER_ITEM',
          null,
          null,
          null,
          null,
          4
        );
      }).toThrow('Price per item and item count are required');
    });
  });
});

