import moment from 'moment';

export default class Interaction {

  constructor(bot, data) {
    this.data = data;
  }

  get user() {
    return this.data.user.id;
  }

  get channel() {
    return this.data.channel.id;
  }

  get event_ts() {
    return this.data.message_ts;
  }

  get timestamp() {
    return moment.unix(+this.data.action_ts);
  }
}