import moment from 'moment';

export function format_slack_date(date) {
  const d = moment.utc(date);
  return d.isValid() ? `<!date^${d.unix()}^{date_num} {time}|${d.format('lll')}>` : '-';
}

export class ReplyError extends Error {
  constructor(...args) {
    super(...args)
    Error.captureStackTrace(this, ReplyError)
  }
}