import assert from 'assert';
import nock from 'nock';
import * as fetch from 'node-fetch';
import { Request } from 'node-fetch';
import sinon from 'sinon';
import NodeFetchPlus from './index';

const testUrl = 'http://test.com';
const sandbox = sinon.createSandbox();

describe('NodeFetchToolkit', () => {
  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    sandbox.restore();
  });

  describe('.fetch', () => {
    describe('node-fetch integration', () => {
      it('Delegates to node-fetch', async () => {
        const mockResponse = sandbox.mock();
        const client = new NodeFetchPlus();
        const fetchStub = sandbox.stub(fetch, 'default').resolves(mockResponse);
        const expectedUrl = `${testUrl}/path`;
        const expectedOpts: fetch.RequestInit = {
          headers: {
            'Test-Header': 'test-value',
          },
        };
        const expectedRequest = new Request(expectedUrl);

        await client.fetch(expectedUrl);
        await client.fetch(expectedRequest);
        await client.fetch(expectedUrl, expectedOpts);
        await client.fetch(expectedRequest, expectedOpts);

        assert.strictEqual(fetchStub.getCalls().length, 4);

        sinon.assert.calledWith(fetchStub, expectedUrl);
        sinon.assert.calledWith(fetchStub, expectedRequest);
        sinon.assert.calledWith(fetchStub, expectedUrl, expectedOpts);
        sinon.assert.calledWith(fetchStub, expectedRequest, expectedOpts);
      });

      it('returns the node-fetch response', async () => {
        const expectedResponse = sandbox.mock();
        const client = new NodeFetchPlus();
        sandbox.stub(fetch, 'default').resolves(expectedResponse);

        const actualResponse = await client.fetch('http://any-url.com');

        assert.strictEqual(actualResponse, expectedResponse);
      });
    });

    describe('retries', () => {
      it('can be configured to retry errors', async () => {
        const client = new NodeFetchPlus({
          retry: {
            factor: 0,
            minTimeout: 1,
            retries: 2,
          },
        });

        nock(testUrl)
          .get('/path')
          .twice()
          .replyWithError(new Error('socket'));

        nock(testUrl)
          .get('/path')
          .reply(200);

        await client.fetch('http://test.com/path');
        assert(nock.isDone(), `Expected 3 calls to ${testUrl}/path`);
      });

      it('can be configured to retry any number of times', async () => {
        const client = new NodeFetchPlus({
          retry: {
            factor: 0,
            minTimeout: 1,
            retries: 10,
          },
        });

        nock(testUrl)
          .get('/path')
          .times(10)
          .replyWithError(new Error('socket'));

        nock(testUrl)
          .get('/path')
          .reply(200);

        await client.fetch('http://test.com/path');
        assert(nock.isDone(), `Expected 3 calls to ${testUrl}/path`);
      });

      const retryOnStatusCodes = [408, 500, 502, 503, 504];

      for (const statusCode of retryOnStatusCodes) {
        it(`retries on status code ${statusCode} by default`, async () => {
          const client = new NodeFetchPlus({
            retry: {
              factor: 0,
              minTimeout: 1,
              retries: 2,
            },
          });

          const firstNock = nock(testUrl)
            .get('/path')
            .reply(statusCode);

          const secondNock = nock(testUrl)
            .get('/path')
            .reply(200);

          await client.fetch('http://test.com/path');
          assert(firstNock.isDone(), `Expected call to ${testUrl}/path`);
          assert(secondNock.isDone(), `Expected second call to ${testUrl}/path`);
        });
      }

      it('can be configured to retry on certain status codes', async () => {
        const client = new NodeFetchPlus({
          retry: {
            factor: 0,
            minTimeout: 1,
            retries: 2,
            retryOnStatusCodes: [418],
          },
        });

        const firstNock = nock(testUrl)
          .get('/path')
          .reply(418);

        const secondNock = nock(testUrl)
          .get('/path')
          .reply(200);

        await client.fetch('http://test.com/path');
        assert(firstNock.isDone(), `Expected call to ${testUrl}/path`);
        assert(secondNock.isDone(), `Expected second call to ${testUrl}/path`);
      });

      it('can be configured to retry on multiple status codes', async () => {
        const client = new NodeFetchPlus({
          retry: {
            factor: 0,
            minTimeout: 1,
            retries: 2,
            retryOnStatusCodes: [408, 500, 504],
          },
        });

        const firstNock = nock(testUrl)
          .get('/path')
          .reply(408);

        const secondNock = nock(testUrl)
          .get('/path')
          .reply(500);

        const thirdNock = nock(testUrl)
          .get('/path')
          .reply(504);

        const res = await client.fetch('http://test.com/path');
        assert(firstNock.isDone(), `Expected call to ${testUrl}/path`);
        assert(secondNock.isDone(), `Expected second call to ${testUrl}/path`);
        assert(thirdNock.isDone(), `Expected second call to ${testUrl}/path`);

        assert.strictEqual(res.status, 504);
      });

      it('returns the last response after failing to retry on a specific status code', async () => {
        const client = new NodeFetchPlus({
          retry: {
            factor: 0,
            minTimeout: 1,
            retries: 2,
            retryOnStatusCodes: [408],
          },
        });

        nock(testUrl)
          .get('/path')
          .thrice()
          .reply(408);

        const res = await client.fetch('http://test.com/path');
        assert.strictEqual(res.status, 408);
      });

      it('throws an error if all retries fail', async () => {
        const client = new NodeFetchPlus({
          retry: {
            factor: 0,
            minTimeout: 1,
            retries: 2,
          },
        });

        nock(testUrl)
          .get('/path')
          .times(3)
          .replyWithError(new Error('socket'));

        return client.fetch('http://test.com/path').then(
          () => {
            throw new Error('Expected error to be thrown but wasnt');
          },
          (err) => {
            assert(err, 'Expected an error but was not found');
            assert(err.message.includes('socket'), `Expected message '${err.message}' to include 'socket'`);
          },
        );
      });
    });

    describe('events', () => {
      it("emits a 'request' event before attempting each request", async () => {
        nock(testUrl)
          .delete('/path')
          .reply(500);

        nock(testUrl)
          .delete('/path')
          .reply(200);

        const consoleStub = sandbox.stub(console, 'info');
        const fetchSpy = sandbox.spy(fetch, 'default');

        const client = new NodeFetchPlus({
          retry: {
            factor: 0,
            minTimeout: 0,
            retries: 1,
            retryOnStatusCodes: [500],
          },
        });
        client.on('request', console.info);

        await client.fetch('http://test.com/path', {
          method: 'DELETE',
        });

        sinon.assert.callOrder(consoleStub, fetchSpy);
        sinon.assert.calledTwice(consoleStub);
        sinon.assert.calledWith(
          consoleStub,
          sinon.match({
            attempt: 1,
            maxAttempts: 2,
            method: 'DELETE',
            url: 'http://test.com/path',
          }),
        );

        sinon.assert.calledWith(
          consoleStub,
          sinon.match({
            attempt: 2,
            maxAttempts: 2,
            method: 'DELETE',
            url: 'http://test.com/path',
          }),
        );
      });

      it("emits a 'response' event after it receives a successful response (i.e. not an error)", async () => {
        nock(testUrl)
          .delete('/path')
          .reply(500);

        nock(testUrl)
          .delete('/path')
          .reply(200);

        const consoleStub = sandbox.stub(console, 'info');
        const fetchSpy = sandbox.spy(fetch, 'default');

        const client = new NodeFetchPlus({
          retry: {
            factor: 0,
            minTimeout: 0,
            retries: 1,
            retryOnStatusCodes: [500],
          },
        });
        client.on('response', console.info);

        await client.fetch('http://test.com/path', {
          method: 'DELETE',
        });

        sinon.assert.callOrder(consoleStub, fetchSpy);
        sinon.assert.calledTwice(consoleStub);
        sinon.assert.calledWith(
          consoleStub,
          sinon.match({
            attempt: 1,
            maxAttempts: 2,
            method: 'DELETE',
            responseTime: sinon.match.number,
            statusCode: 500,
            url: 'http://test.com/path',
          }),
        );

        sinon.assert.calledWith(
          consoleStub,
          sinon.match({
            attempt: 2,
            maxAttempts: 2,
            method: 'DELETE',
            responseTime: sinon.match.number,
            statusCode: 200,
            url: 'http://test.com/path',
          }),
        );
      });

      it("emits an 'error' event after it receives an error", async () => {
        nock(testUrl)
          .delete('/path')
          .replyWithError(new Error('BOOM!'));

        nock(testUrl)
          .delete('/path')
          .reply(200);

        const consoleStub = sandbox.stub(console, 'info');
        const fetchSpy = sandbox.spy(fetch, 'default');

        const client = new NodeFetchPlus({
          retry: {
            factor: 0,
            minTimeout: 0,
            retries: 1,
          },
        });
        client.on('error', console.info);

        await client.fetch('http://test.com/path', {
          method: 'DELETE',
        });

        sinon.assert.callOrder(consoleStub, fetchSpy);
        sinon.assert.calledOnce(consoleStub);
        sinon.assert.calledWith(
          consoleStub,
          sinon.match({
            attempt: 1,
            maxAttempts: 2,
            message: 'request to http://test.com/path failed, reason: BOOM!',
            method: 'DELETE',
            responseTime: sinon.match.number,
            url: 'http://test.com/path',
          }),
        );
      });
    });
  });
});
