const moment = require('moment-timezone');
const staticPromos = require('./static-promos.json');
const failoverPromos = require('./failover-promos.json');

const inningCodes = ['t1', 'b1', 't2', 'b2', 't3', 'b3', 't4', 'b4', 't5', 'b5', 't6', 'b6', 't7', 'b7', 't8', 'b8'];
const customPromos = [];

const setupCustomPromos = async dateTimeData => {
    await getRSSJson('https://www.dodgersnation.com/feed', async ({rss: {channel: [c]}}) => {
      const {startTime, tz} = dateTimeData;
      const sMoment = moment(startTime).tz(tz);
      const icymi = 'ICYMI: ';
  
      const feedData = c.item
        .filter(({pubDate: [d]}) => {
          const dMoment = moment(d).tz(tz);
          return dMoment.isSame(sMoment, 'day') && dMoment.isBefore(sMoment);
        }).map(i => ({copy: icymi + i.title[0], link: i.link[0] + '?utm_source=DNTwittercast&utm_medium=Game&utm_campaign=Phase1'}));
  
      const promos = feedData
        .concat(failoverPromos)
        .slice(0, 8);
  
      for (let i=0; i<8; i++) customPromos.push(staticPromos[i], promos[i]);
    })
}

const getCustomPromo = async (linescore, dateTimeData) => {
    if (customPromos.length === 0) {
      await setupCustomPromos(dateTimeData);
    }
  
    let inningCode = '';
    switch (linescore.inningState) {
      case 'Bottom':
      case 'End':
        inningCode = 'b';
        break;
      case 'Top':
      case 'Middle':
        inningCode = 't';
        break;
    }
  
    if (inningCode) {
      inningCode += linescore.currentInning;
      const promoIndex = inningCodes.indexOf(inningCode);
      if (promoIndex >= 0) {
        const promo = customPromos[promoIndex];
        if (!promo) return '';
        const tweet = '\n\n' + promo.copy + '\n' + promo.link;
  
        return tweet;
      }
    }
  
    return '';
}

module.exports = {
    getCustomPromo
}