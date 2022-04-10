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
            para = quote.css('p::text')
            img = quote.css('img').xpath('@data-src').get()
            text = ''
            if title:
                arr.append(title)
            if para:
                for p in para:
                    text = text + p.get()
            if img:
                arr.append(img)
            if text != '':
                arr.append(text)
        section1 = response.xpath('//*[@id="js_content"]/section/section')
        for s in section1:
            para = s.css('p::text')
            span = s.css('span::text')
            strong = s.css('strong::text')
            img = s.css('img').xpath('@data-src').get()
            end = s.css('section::text')
            text = ''
            if para:
                for p in para:
                    text = text + p.get()
            if span:
                for w in span:
                    print(w.get())
                    text = text + w.get()
            if strong:
                for r in strong:
                    text = text + r.get()
            if img:
                arr1.append(img)
            if end:
                for e in end:
                    arr1.append(e.get())
            if text != '':
                arr1.append(text)
        if(len(arr) > len(arr1)):
            return {'result': arr}
        else:
            return {'result': arr1}
        
        
