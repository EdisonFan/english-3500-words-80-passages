'use strict';

const https = require('https');
const { URL } = require('url');

const Service = require('egg').Service;

let _agent = null;

class ChatService extends Service {
  async _getAgent() {
    if (_agent !== null) return _agent;
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
    if (!proxy) { _agent = undefined; return _agent; }
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    _agent = new HttpsProxyAgent(proxy);
    return _agent;
  }

  // 把前端 messages 转发到 ant-ling，并 stream 回前端
  // onChunk(chunk)/onEnd()/onError(err) 由调用方提供
  pipeStream({ messages, temperature, max_tokens }, callbacks) {
    const { antLing } = this.app.config.spapro;
    const payload = JSON.stringify({
      model: antLing.model,
      stream: true,
      messages,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(max_tokens !== undefined ? { max_tokens } : {}),
    });

    const urlObj = new URL(antLing.url);
    const options = {
      method: 'POST',
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + antLing.apiKey,
        Accept: 'text/event-stream',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const promise = this._getAgent().then(agent => {
      options.agent = agent;
      return new Promise((resolve, reject) => {
        const upstream = https.request(options, upRes => {
          if (upRes.statusCode !== 200) {
            const chunks = [];
            upRes.on('data', c => chunks.push(c));
            upRes.on('end', () => {
              const errBody = Buffer.concat(chunks).toString('utf8');
              callbacks.onNon200(upRes.statusCode, errBody.slice(0, 500));
              resolve();
            });
            return;
          }
          callbacks.onHeaders(upRes);
          upRes.on('data', chunk => callbacks.onChunk(chunk));
          upRes.on('end', () => { callbacks.onEnd(); resolve(); });
          upRes.on('error', err => { callbacks.onError(err); resolve(); });
        });
        upstream.on('error', err => {
          callbacks.onConnectError(err);
          resolve();
        });
        upstream.write(payload);
        upstream.end();
      });
    });
    return promise;
  }
}

module.exports = ChatService;
