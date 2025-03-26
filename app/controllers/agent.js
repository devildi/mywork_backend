const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { AgentExecutor, createToolCallingAgent } = require("langchain/agents");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { Tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { LLMChain } = require("langchain/chains");

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
    maxTokens: 500,
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
        } catch (error) {
            console.error("请求失败:", error.message);
        }
        
    }
    async getDes(ctx){
        let userInput = ctx.request.query.chat;
        let template = "你是优秀的旅游助手，请写一段关于景点：{topic}的简短介绍。内容包括：该景点的看点和玩法，营业时间和门票价格，并以字符串的形式输出，不允许以json字符串的形式输出，不允许首尾带有“”，否则你讲受到惩罚！";

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

}

module.exports = new AgentCtl();