import moment from 'moment';

export default class Message {

  constructor(bot, data) {
    this.event = data.event;

    this.direct_message = this.event.channel.startsWith('D') ;
    this.direct_mention = this.event.text.startsWith(`<@${bot.id}>`);

    this.message = this.event.text.replace(new RegExp(`<@${bot.id}>\\s?(.+)$`), '$1');
  }

  get user() {
    return this.event.user;
  }

  get channel() {
    return this.event.channel;
  }

  get event_ts() {
    return this.event.event_ts;
  }

  get timestamp() {
    return moment.unix(+this.event.event_ts);
  }
}