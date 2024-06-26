import url from 'url';
import https from 'https';
import moment from 'moment';
import { WebClient } from '@slack/web-api';

import Message from './message';
import Interaction from './interaction';
import { ReplyError, format_slack_date } from './utils';

export default class SlackBot {
  constructor(opt = {}) {
    this.opt = opt;

    this._client = new WebClient(this.opt.bot_token);
    this._messageListeners = [];
    this._interactionListeners = [];
  }

  async init() {
    const data = await this._client.auth.test();
    this.bot = {
      id: data.user_id,
      bot_id: data.bot_id,
      name: data.user,
    };
  }

  get client() {
    return this._client;
  }

  get middleware() {
    const that = this;
    return function (req, res, next) {
      const result = that._proccessEvent(req.body) || {};
      res.json(result);
    }
  }

  message(patterns, callback, options) {
    const { overhear = false } = options || {};
    if (typeof (patterns) === 'string' || patterns instanceof RegExp) {
      patterns = [patterns];
    }

    this._messageListeners.push(async (event) => {
      if ((overhear || event.direct_message || event.direct_mention) && test_pattern(patterns, event, event.message)) {
        try {
          await callback(event);
        }
        catch (error) {
          console.error(error);
          const text = error instanceof ReplyError ? error.message : 'Something went wrong';
          await this.replyEphemeral(event, { text });
        }
        return true;
      }
      return false;
    });
  }

  interaction(patterns, callback) {
    if (typeof (patterns) === 'string' || patterns instanceof RegExp) {
      patterns = [patterns];
    }

    this._interactionListeners.push(async (event) => {
      const value = event.data.callback_id ?? event.data.actions?.[0]?.action_id ?? '';
      if (test_pattern(patterns, event, value)) {
        try {
          await callback(event);
        } catch (error) {
          console.error(error);

          const text = error instanceof ReplyError ? error.message : 'Something went wrong';
          await this.replyEphemeral(event, { text });
        }
        return true;
      }
      return false;
    });
  }

  async reply({ event }, reply) {
    return await this._client.chat.postMessage({ channel: event.channel, ...reply });
  }

  async updateChat({ event }, reply) {
    return await this._client.chat.update({ ts: event.event_ts, channel: event.channel, ...reply });
  }

  async replyEphemeral({ event }, reply) {
    return await this._client.chat.postEphemeral({ channel: event.channel, user: event.user, ...reply });
  }

  async replyThread({ event }, reply) {
    return await this._client.chat.postMessage({ channel: event.channel, thread_ts: event.ts, ...reply });
  }

  async deleteChat({ event }) {
    return await this._client.chat.delete({ ts: event.event_ts, channel: event.channel });
  }

  updateInteraction(event, reply) {
    return new Promise((resolve, reject) => {
      const dst = url.parse(event.data.response_url);

      const data = `payload=${encodeURIComponent(JSON.stringify(reply))}`;

      const options = {
        hostname: dst.hostname,
        port: 443,
        path: dst.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': data.length,
        },
      }

      const request = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          return reject(res.statusMessage)
        }
        resolve();
      })

      request.on('error', error => reject(error));

      request.write(data);
      request.end();
    })
  }

  async proceedEvent(event) {
    if (event.token !== this.opt.verification_token) {
      throw new Error(('Failed to verify token'));
    }

    if (event.type === 'url_verification') {
      return { challenge: event.challenge }
    }

    // Workarround to solve issue with lambda duplicated invokes up to 3 times with interval 10 minutes
    const timestamp = moment().subtract(5, 'minutes');

    if (event.type === 'event_callback') {
      if (event.event.bot_id && event.event.bot_id === this.bot.bot_id) {
        return {};
      }

      if (!event.event.text) { return {} }

      const message = new Message(this.bot, event);
      if (timestamp.isAfter(message.timestamp)) { return {} }

      const results = await Promise.all(this._messageListeners.map(listener => listener(message)));
      if ((message.direct_message || message.direct_mention) && !results.includes(true)) {
        return await this.reply(message, { text: 'I don`t understand you.' });
      }
    }
    else if (event.type === 'interactive_message' || event.type === 'block_actions') {
      const message = new Interaction(this.bot, event);
      if (timestamp.isAfter(message.timestamp)) {
        return {};
      }
      await Promise.all(this._interactionListeners.map(listener => listener(message)));
    }
  }
}

export { ReplyError, format_slack_date };

function test_pattern(patterns, event, value) {
  for (const i in patterns) {
    const pattern = patterns[i];
    if (typeof pattern === 'string' && pattern.toLowerCase() === value.toLowerCase()) {
      return true;
    } else if (pattern instanceof RegExp) {
      const match = value.match(pattern);
      if (match) {
        event.match = match;
        return true;
      }
    }
  }
  return false;
}
