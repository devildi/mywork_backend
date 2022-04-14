import scrapy
class ArticleSpider(scrapy.Spider):
    name = 'article'
    allowed_domains = ['mp.weixin.qq.com']
    #start_urls = [articleUrl]
    def parse(self, response):
        arr = []
        arr1 = []
        sections = response.xpath('//*[@id="js_content"]/section/section/section/section')
        for quote in sections:
            title = quote.xpath('section//strong/text()').get()
            para = quote.xpath('p')
            img = quote.css('img').xpath('@data-src').get()
            text = ''
            if title:
                arr.append(title)
            if para:
                for p in para:
                    if p.xpath('./text()').get():
                        text = text + p.xpath('./text()').get()
                    spans = p.xpath('span')
                    if spans:
                        for s in spans:
                            text = text + s.xpath('./text()').get()
            if img:
                arr.append(img)
            if text != '':
                arr.append(text)
        section1 = response.xpath('//*[@id="js_content"]/section/section|//*[@id="js_content"]/section/p')
        for s in section1:
            para = s.css('p')
            strong = s.css('strong::text')
            img = s.css('img').xpath('@data-src')
            end = s.css('section::text')
            text = ''
            if para:
                for p in para:
                    for pp in p.css('p::text'):
                        text = text + pp.get()
                    spans = p.css('span')
                    if spans:
                        for span in spans:
                            spanArray = span.xpath('./text()')
                            for span1 in spanArray:
                                text = text + span1.get()
            if strong:
                for r in strong:
                    text = text + r.get()
            if text != '':
                arr1.append(text)
            if img:
                for i in img:
                    arr1.append(i.get())
            if end:
                for e in end:
                    arr1.append(e.get())
        if(len(arr) > len(arr1)):
            return {'result': arr}
        else:
            return {'result': arr1}
        
        
