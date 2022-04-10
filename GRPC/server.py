#encoding:utf-8
#python -m grpc_tools.protoc -I../../protos --python_out=. --grpc_python_out=. ../../protos/helloworld.proto
from concurrent import futures
from multiprocessing import Process
import logging
import multiprocessing

import grpc

import storyproto_pb2
import storyproto_pb2_grpc

from scrapy import signals
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings
from scrapy.signalmanager import dispatcher

from microService.article import ArticleSpider

def run_proc(name, q):
    results = []
    def crawler_results(signal, sender, item, response, spider):
        results.append(item)
    dispatcher.connect(crawler_results, signal=signals.item_scraped)
    process = CrawlerProcess(get_project_settings())
    process.crawl(ArticleSpider, start_urls=[name])
    process.start()
    q.put(results[0])

class Greeter(storyproto_pb2_grpc.GreeterServicer):

    def SayHello(self, request, context):
        print(request.name)
        q = multiprocessing.Queue()
        p = Process(target=run_proc, args=(request.name,q))
        p.start()
        p.join()
        re = "|".join(q.get()['result'])
        return storyproto_pb2.HelloReply(message=re)


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    storyproto_pb2_grpc.add_GreeterServicer_to_server(Greeter(), server)
    server.add_insecure_port('[::]:50051')
    server.start()
    server.wait_for_termination()


if __name__ == '__main__':
    logging.basicConfig()
    print('开启grpc server：')
    serve()
