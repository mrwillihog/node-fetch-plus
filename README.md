[![Build Status](https://travis-ci.org/mrwillihog/node-fetch-plus.svg?branch=master)](https://travis-ci.org/mrwillihog/node-fetch-plus)

# Node Fetch Plus

An extension of [node-fetch](https://github.com/bitinn/node-fetch) that provides retries, timing and logging.

## Installation

```sh
$ npm install node-fetch-plus --save
```

## Configuration

A node-fetch-plus client can be created using the `NodeFetchPlus` constructor.

```js
const NodeFetchPlus = require('node-fetch-plus');

const client = new NodeFetchPlus();
```

By default this creates a client with a `fetch` method that is _identical_ to [node-fetch](https://github.com/bitinn/node-fetch). For example, the following are identical:

```js
const fetch = require('node-fetch');

const NodeFetchPlus = require('node-fetch-plus');
const client = new NodeFetchPlus();

fetch('http://test.com');
client.fetch('http://test.com');
```

The `fetch` method of a `node-fetch-plus` instance supports all the options that `node-fetch` supports. [Read the documentation](https://github.com/bitinn/node-fetch) for a full list of options.

### Retries

`node-fetch-plus` supports retrying failed HTTP requests. It will retry on any error (e.g. network connection timeouts):

```js
const NodeFetchPlus = require('node-fetch-plus')
const client = new NodeFetchPlus({
  retries: {
    retries: 2,
    minTimeout: 300
  }
});

await client.fetch('http://test.com');
```

This will try to make a request to `http://test.com` upto 3 times. If the request fails after the maximum number of retries an error will be thrown. Retries are handled by the [retry](https://github.com/tim-kos/node-retry), below is a list of supported options.

  * `retries`: The maximum amount of times to retry the operation. Default is `10`. Seting this to `1` means `do it once, then retry it once.`
  * `factor`: The exponential factor to use. Default is `2`.
  * `minTimeout`: The number of milliseconds before starting the first retry. Default is `1000`.
  * `maxTimeout`: The maximum number of milliseconds between two retries. Default is `Infinity`.
  * `randomize`: Randomizes the timeouts by multiplying with a factor between `1` to `2`. Default is `false`.

[Read the documentation](https://github.com/tim-kos/node-retry) to see a list of all supported options.

By default `node-fetch-plus` will retry successful HTTP requests with the following status codes:

  * **408** Request timeout
  * **500** Internal server error
  * **502** Bad gateway
  * **503** Service unavailable
  * **504** Gateway timeout

To configure this behaviour you can specify a list of status codes which should be retried:

```js
const NodeFetchPlus = require('node-fetch-plus')
const client = new NodeFetchPlus({
  retries: {
    retries: 2,
    minTimeout: 300,
    retryOnStatusCodes: [408, 500, 502, 503, 504]
  }
});

await client.fetch('http://test.com');
```

This will retry the request if it receives any of the status codes listed in `retryOnStatusCodes`. After all retries the last response is returned from the client.

### Events

`node-fetch-plus` is an EventEmitter and will emit events at certain times within the request/response lifecycle.

#### Request

A `request` event is emitted just before the HTTP request is made.

```js
const NodeFetchPlus = require('node-fetch-plus')
const client = new NodeFetchPlus();

client.on('request', (data) => {
  console.log(`Making ${data.method} request to ${data.url}. Attempt ${data.attempt} of ${data.maxAttempts}`);
});
```

The following information is available:

 * `url` - the full URL being requested.
 * `method` - the HTTP method of the request.
 * `attempt` - the attempt being made, starts at `1`.
 * `maxAttempts` - the maximum number of attempts that will be made.

#### Response

A `response` event is emitted just after the HTTP response is received.

```js
const NodeFetchPlus = require('node-fetch-plus')
const client = new NodeFetchPlus();

client.on('response', (data) => {
  console.log(`Received ${data.statusCode} from ${data.url} in ${data.responseTime}ms. Attempt ${data.attempt} of ${data.maxAttempts}`);
});
```

The following information is available:

 * `url` - the full URL being requested.
 * `method` - the HTTP method of the request.
 * `statusCode` - the HTTP status code of the response.
 * `responseTime` - the time it took to execute the request, in milliseconds.
 * `attempt` - the attempt being made, starts at `1`.
 * `maxAttempts` - the maximum number of attempts that will be made.

#### Error

An `error` event is emitted when a request fails to execute.

```js
const NodeFetchPlus = require('node-fetch-plus')
const client = new NodeFetchPlus();

client.on('error', (data) => {
  console.log(`Error received while making ${data.method} request to ${data.url} because ${data.message}. Attempt ${data.attempt} of ${data.maxAttempts}`);
});
```

The following information is available:

 * `url` - the full URL being requested.
 * `method` - the HTTP method of the request.
 * `message` - the error message that was received.
 * `responseTime` - the time it took to execute the request, in milliseconds.
 * `attempt` - the attempt being made, starts at `1`.
 * `maxAttempts` - the maximum number of attempts that will be made.

**NOTE** By default if an `EventEmitter` emits an `error` event and there are no bound listeners it will terminate the node process. The events in `node-fetch-plus` are considered optional and so we bind an empty listener on the `error` event when you call `createClient`. This prevents the process being terminated should you decide not to listen to the `error` event.

### Testing node-fetch-plus

When integrating with `node-fetch-plus` it can be useful to test certain responses without the retries taking effect. You can easily stub the `fetch` method using [sinon](https://github.com/sinonjs/sinon/).

```js
const NodeFetchPlus = require('node-fetch-plus');
const { mockResponse } = require('node-fetch-plus/test');

const sinon = require('sinon);
const sandbox = sinon.createSandbox();

const response = mockResponse(500);
sandbox.stub(NodeFetchPlus.prototype, 'fetch').resolves(response);

const client = new NodeFetchPlus();

await client.fetch('http://any-url.com');
```

The `mockResponse` function returns a valid `node-fetch` `Response`. It takes a `status` and an optional body. So if you want to test the response body too:

```js
const NodeFetchPlus = require('node-fetch-plus');
const { mockResponse } = require('node-fetch-plus/test');

const sinon = require('sinon);
const sandbox = sinon.createSandbox();

const response = mockResponse(200, JSON.stringify({
  id: 1234
}));
sandbox.stub(NodeFetchPlus.prototype, 'fetch').resolves(response);

const client = new NodeFetchPlus();

const res = await client.fetch('http://any-url.com');
const body = await res.json();
```

## Related

 * [node-fetch](https://github.com/bitinn/node-fetch) - The underlying module used for making HTTP requests.
 * [p-retry](https://github.com/sindresorhus/p-retry) - Helper function used to retry rejected promises.
 * [node-retry](https://github.com/tim-kos/node-retry) - Module used to handle exponential backoff for retries.
