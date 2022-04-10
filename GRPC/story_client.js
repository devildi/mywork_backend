//let articleUrl = 'https://mp.weixin.qq.com/s?__biz=MzIyMTM3MzE1MA==&mid=2247484651&idx=1&sn=2cbf9de89735555acbd30f456ec68b90&chksm=e83cf35adf4b7a4c25c72bdffc6b4c6bfa751d74a47a51b541b70f67bdc0ca020663fef050c2&token=1642341609&lang=zh_CN#rd'
var PROTO_PATH = './GRPC/protos/storyproto.proto';
var grpc = require('@grpc/grpc-js');
var protoLoader = require('@grpc/proto-loader');
var packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
     longs: String,
     enums: String,
     defaults: true,
     oneofs: true
    });
var story_proto = grpc.loadPackageDefinition(packageDefinition).helloworld;

var client = new story_proto.Greeter
  (
    'localhost:50051',
    grpc.credentials.createInsecure()
  )
module.exports = client
// client.sayHello({name: articleUrl}, (err, response) => {
//     console.log('从GRPC回传的信息：',response.message);
// });
