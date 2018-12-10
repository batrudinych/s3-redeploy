'use strict';

const cfHelper = require('../../src/lib/cf-helper');

describe('CloudFront helper', () => {
  describe('invalidate', () => {
    const nowMock = Date.now();
    const setupMocks = () => {
      const mockPromiseFn = jest.fn();
      const client = {
        createInvalidation: jest.fn(() => ({
          promise: mockPromiseFn,
        })),
      };
      const distId = 'random-id';
      const paths = ['/about', '/home'];
      return { client, mockPromiseFn, distId, paths };
    };

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(nowMock);
    });

    test('creates an invalidation', () => {
      const { client, mockPromiseFn, distId, paths } = setupMocks();
      cfHelper.invalidate(client, distId, paths);
      expect(Date.now).toHaveBeenCalledTimes(1);
      expect(client.createInvalidation).toBeCalledWith({
        DistributionId: distId,
        InvalidationBatch: {
          CallerReference: `s3-redeploy-${nowMock}`,
          Paths: {
            Quantity: paths.length,
            Items: paths,
          },
        },
      });
      expect(mockPromiseFn).toHaveBeenCalledTimes(1);
    });

    test('uses default paths', () => {
      const { client, mockPromiseFn, distId } = setupMocks();
      cfHelper.invalidate(client, distId);
      expect(Date.now).toHaveBeenCalledTimes(1);
      expect(client.createInvalidation).toBeCalledWith({
        DistributionId: distId,
        InvalidationBatch: {
          CallerReference: `s3-redeploy-${nowMock}`,
          Paths: {
            Quantity: 1,
            Items: ['/*'],
          },
        },
      });
      expect(mockPromiseFn).toHaveBeenCalledTimes(1);
    });
  });
});
