module.exports = {
	port: 4000,
	secret: 'DavinciUser',
	authority: '41538bc6dd',
	f1: function(str1, str2){
		let index = str1.split('|').indexOf(str2)
		if(index > -1){
			return true
		} else {
			return false
		}
	},
	h0: function(timestamp = Date.now()){
		const target = new Date(timestamp);
	  target.setHours(0);
	  target.setMinutes(0);
	  target.setSeconds(0);
	  target.setMilliseconds(0);
	  return target.getTime();
	},
	d0: function(gap, timestamp = Date.now()){
		const target = new Date(timestamp);
		return target.setDate(target.getDate() - gap);
	}
};