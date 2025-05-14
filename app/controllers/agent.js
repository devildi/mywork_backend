const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { AgentExecutor, createToolCallingAgent } = require("langchain/agents");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { Tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { LLMChain } = require("langchain/chains");
const path = require('path')
const fs = require('fs').promises
const filePath = path.join(__dirname, '../../results/meg.txt')
const clipboardy = require('clipboardy');

class CalculatorTool extends Tool {
    name = "calculator";
    description = "用于计算两个数的和。输入应为包含两个数字的对象，如 { a: 1, b: 2 }。";
  
    // 定义输入参数模式
    schema = z.object({
      a: z.number().describe("第一个数字"),
      b: z.number().describe("第二个数字")
    });
  
    // 工具的执行逻辑
    async _call(input) {
      const { a, b } = this.schema.parse(input); // 验证输入
      return a + b; // 返回计算结果
    }
}
const calculatorTool = new CalculatorTool();

const chatModel = new ChatOpenAI({
    modelName: "deepseek-chat", // 根据实际模型名称调整
    temperature: 0,
    maxTokens: 1000,
    configuration: {
      baseURL: "https://api.deepseek.com/v1", // DeepSeek API 地址
      apiKey: "sk-105b4399cf0b4040b3d182214e887850" // 替换为实际 API 密钥
    }
});

const systemPrompt = `
你是一个友好的人工智能助手，由 DeepSeek 提供技术支持。
请用中文简洁清晰地回答用户问题，如果遇到无法回答的问题请诚实说明。
当前时间：${new Date().toLocaleString()}
`;

const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"] 
]);

const tools = []

const agent = createToolCallingAgent({
    llm: chatModel,
    tools,
    prompt: promptTemplate
});

const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true // 调试时查看详细过程
});

let chatHistory = [];

class AgentCtl {
    async chat(ctx){
        let userInput = ctx.request.body.chat
        
        try {
        // 执行 Agent
        const response = await executor.invoke({
            input: userInput,
            chat_history: chatHistory.map(m => m.content)
        });
    
        // 更新聊天历史
        chatHistory.push(new HumanMessage(userInput));
        chatHistory.push(new AIMessage(response.output));
    
        console.log(`\n助手: ${response.output}`)
        ctx.body = response.output
        } catch (error) 
        {
            console.error("请求失败:", error.message);
        }
        
    }
    async getDes(ctx){
        let userInput = ctx.request.query.chat;
        let template = "你是优秀的旅游助手，请写一段关于景点：{topic}的简短介绍。内容包括：该景点的看点和玩法，营业时间和门票价格，并以中文字符串的形式输出，不允许以json字符串的形式输出，不允许首尾带有“”，否则你讲受到惩罚！";

        // 创建 Prompt
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", template]
        ]);

        // 创建 LLMChain
        let chain = new LLMChain({
            llm: chatModel, // 使用正确的变量 chatModel
            prompt: prompt
        });

        // 执行链
        let response = await chain.run({ topic: userInput });
        console.log(response)
        ctx.body = response;
    }
    async getInfos(ctx){
        let userInput = ctx.request.query.chat;
        let template = "我是一个专业的旅行行程助手，我本次的旅程会经过如下地点：{topic}，请问：这些目的地都在哪个城市，哪个国家，最后为本次旅程打几个标签。返回的格式为json字符串，key包含city、country和tags，且返回的字符串为单行形式，不要输出多行的给我，否则你会受到惩罚！";

        // 创建 Prompt
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", template]
        ]);

        // 创建 LLMChain
        let chain = new LLMChain({
            llm: chatModel, // 使用正确的变量 chatModel
            prompt: prompt
        });

        // 执行链
        let response = await chain.run({ topic: userInput });
        let obj = JSON.parse(response)
        obj.tags = obj.tags.join('/')
        let str = JSON.stringify(obj)
        
        ctx.body = str;
    }
    async formatTripFromLLM(ctx){
        let userInput = ctx.request.query.chat;
        let template = "你是一个专业的旅行家和数据处理高级工程师，你接收到的原始文本数据如下：{topic}。这是一段旅行行程的描述，包含了多日的景点信息（如果你收到的是一段与旅行规划不相干文本，直接返回“error”）。我需要你做如下的事情：首先，为每个景点完善总结描述信息（des）,内容为该景点的看点玩法、营业时间、门票价格以及从上一个景点的前往的交通方案（每日的第一个景点不需要添加交通信息）；其次，为每个景点添加经纬度坐标；最后以数组字符串的方式返回给我，行程数据以一个大数组包裹，数组中的每个元素为每一天的景点数据集合，例如：一个2天的行程应该是类似[[], []]这样的数据结构；每个景点为一个对象，对象的key包括：nameOfScence（景点名称）、longitude（经度）、latitude（纬度）、des（景点描述）、picURL（图片地址）、category（分类，0为景点，1为酒店，2为餐饮，）。请注意：你返回的字符串必须是单行的，不允许换行，否则你会受到惩罚！";
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", template]
        ]);
        let chain = new LLMChain({
            llm: chatModel, // 使用正确的变量 chatModel
            prompt: prompt
        });
        let response = await chain.run({ topic: userInput });
        //let string = '[[{"nameOfScence":"沈阳故宫","longitude":"123.455676","latitude":"41.798386","des":"是的，沈阳也有故宫，就是小点！","picURL":"","pointOrNot":true,"contructor":"contructor","category":0,"done":false},{"nameOfScence":"大帅府","longitude":"123.457791","latitude":"41.794058","des":"张作霖故居，全沈阳最有味道的地方，游览的时候一定要有讲解！","picURL":"","pointOrNot":true,"contructor":"contructor","category":0,"done":false}],[{"nameOfScence":"1905文创园","longitude":"123.382444","latitude":"41.812451","des":"沈阳798，每周五会有集市，值得一逛！","picURL":"","pointOrNot":true,"contructor":"contructor","category":0,"done":false},{"nameOfScence":"918历史博物馆","longitude":"123.467533","latitude":"41.836397","des":"勿忘国耻918","picURL":"","pointOrNot":true,"contructor":"contructor","category":0,"done":false}]]'
        ctx.body = response;
    }

    //下面的2个函数与115相关
    async meg(ctx){
        let {content} = ctx.request.body
        try{   
            fs.appendFile(filePath, content + '\n', 'utf8');
            ctx.body = 'yes'
        }catch(err){
            console.log(err)
            ctx.body = 'error'
        }
    }

    async copyMeg(ctx){
        try{   
            const data = await fs.readFile(filePath, 'utf8');
            await clipboardy.write(data.trim());
            console.log('文件内容已复制到剪贴板');
            await fs.unlink(filePath);
            console.log('文件已删除');
            ctx.body = 'yes'
        }catch(err){
            console.log(err)
            ctx.body = 'error'
        }
    }
}

module.exports = new AgentCtl();