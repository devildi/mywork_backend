const nodemailer = require("nodemailer");

module.exports = {
	port: 4000,
	secret: 'DavinciUser',
	authority: 'wudi41538bc6dd',
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
	},
	sendMail: async function(wechat, destination){
		//let testAccount = await nodemailer.createTestAccount();
		let transporter = nodemailer.createTransport({
			host: "smtp.gmail.com",
			port: 465,
			service: 'gmail',
			secure: true, // true for 465, false for other ports
			auth: {
				user: 'devildi1987@gmail.com', // generated ethereal user
				pass: '41538bc6dd', // generated ethereal password
			},
		});
		let info = await transporter.sendMail({
			from: '吴迪<devildi1987@gmail.com>', // sender address
			to: "387694318@qq.com", // list of receivers
			subject: "NextSticker有新增用户", // Subject line
			text: `NextSticker有新增用户:${wechat}`, // plain text body
			html: `<b>微信号：${wechat}</b><br /><b>目的地：${destination}</b>`, // html body
		});
    	//console.log("Message sent: %s", info.messageId);
    	//console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
	}
};