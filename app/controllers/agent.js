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

class ScenicSpotDescriptionTool extends Tool {
    name = "scenic_spot_description";
    description = "为旅游景点生成简短介绍。输入应为景点名称，输出包括景点的看点玩法、营业时间和门票价格。";
    schema = z.object({
        topic: z.string().describe("景点名称")
    });
    async _call(input) {
        console.log("ScenicSpotDescriptionTool 被调用，输入:", input);
        const { topic } = this.schema.parse(input);
        let template = "你是优秀的旅游助手，请写一段关于景点：{topic}的简短介绍。内容包括：该景点的看点和玩法，营业时间和门票价格，并以中文字符串的形式输出，不允许以json字符串的形式输出，不允许首尾带有“”，否则你讲受到惩罚！";

        const prompt = ChatPromptTemplate.fromMessages([
            ["system", template]
        ]);
        const chain = new LLMChain({
            llm: this.llm,
            prompt: prompt
        });
        return await chain.run({ topic });
    }
}

class TravelInfoTool extends Tool {
    name = "travel_info";
    description = "分析旅行目的地信息。输入为多个地点名称，输出包含城市、国家和旅行标签的JSON格式信息。";
    schema = z.object({
        topic: z.string().describe("多个地点名称，用逗号分隔")
    });
    async _call(input) {
        const { topic } = this.schema.parse(input);
        const template = "我是一个专业的旅行行程助手，我本次的旅程会经过如下地点：{topic}，请问：这些目的地都在哪个城市，哪个国家，最后为本次旅程打几个标签。返回的格式为json字符串，key包含city、country和tags。";
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", template]
        ]);
        const chain = new LLMChain({
            llm: this.llm,
            prompt: prompt
        });
        return await chain.run({ topic });
    }
}

class TripFormatTool extends Tool {
    name = "trip_format";
    description = "将原始旅行行程文本格式化为结构化数据。输入为行程文本，输出为包含景点信息、坐标、描述等的JSON数组字符串。";
    schema = z.object({
        topic: z.string().describe("原始行程文本")
    });
    async _call(input) {
        const { topic } = this.schema.parse(input);
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", "你是一个专业的旅行家和数据处理高级工程师，你接收到的用户输入数据如下：{topic}。这是一段旅行行程的描述，包含了多日的景点信息（如果你收到的是一段与旅行规划不相干文本，直接返回“error”）。我需要你做如下的事情：首先，为每个景点完善总结描述信息（des）,内容为该景点的看点玩法、营业时间、门票价格以及从上一个景点的前往的交通方案（每日的第一个景点不需要添加交通信息）；其次，为每个景点添加经纬度坐标；最后以数组字符串的方式返回给我，行程数据以一个大数组包裹，数组中的每个元素为每一天的景点数据集合，例如：一个2天的行程应该是类似[[], []]这样的数据结构，即JSON数组，；每个景点为一个json对象，对象的key包括：nameOfScence（景点名称）、longitude（经度）、latitude（纬度）、des（景点描述）、picURL（图片地址）、category（分类，0为景点，1为酒店，2为餐饮，）。请注意：你返回的字符串必须是单行的，不允许换行，类似这样：否则你会受到惩罚！"]
        ])
        
        const chain = new LLMChain({
            llm: this.llm,
            prompt: prompt
        });
        return await chain.run({ topic });
    }
}

class TripValidationTool extends Tool {
    name = "trip_validation";
    description = "校验和修正旅行行程数据。输入为JSON数组格式的行程数据，输出为经过校验和修正后的JSON数组行程数据。会移除无参观价值的点并修正分类错误。";
    schema = z.object({
        tripData: z.string().describe("JSON数组格式的行程数据")
    });
    async _call(input) {
        const { tripData } = this.schema.parse(input);
        const template = `
        你是一个严格的数据质量审核员，请检查并修正以下旅行行程数据：
        {tripData}

        修正要求：
        1. 严格保持原始数据结构不变（外层数组表示天数，内层数组表示当天的景点）
        2. 移除没有参观价值的点（机场、火车站、纯交通中转站等）
        3. 确保分类正确：
        - 景点/公园/博物馆等: category = 0
        - 酒店/住宿: category = 1
        - 餐厅/美食: category = 2
        4. 混合功能地点优先作为景点(category=0)
        5. 确保描述信息完整
        6. 必须返回完全相同的JSON结构，只做内容修正

        重要提示：返回结果必须是有效的单行JSON数组字符串，保持 [[], []] 的原有结构！
        `;
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", template]
        ]);
        const chain = new LLMChain({
            llm: this.llm,
            prompt: prompt
        });
        const validatedResponse = await chain.run({ tripData });
        try {
            // 验证JSON格式
            JSON.parse(validatedResponse);
            return validatedResponse;
        } catch (e) {
            console.error("校验失败，返回原始数据:", e);
            return tripData; // 校验失败时返回原始数据
        }
    }
}

const chatModel = new ChatOpenAI({
    modelName: "deepseek-chat", // 根据实际模型名称调整
    temperature: 0,
    maxTokens: 3000,
    configuration: {
      baseURL: "https://api.deepseek.com/v1", // DeepSeek API 地址
      apiKey: "sk-105b4399cf0b4040b3d182214e887850" // 替换为实际 API 密钥
    }
});

const calculatorTool = new CalculatorTool();

const scenicSpotTool = new ScenicSpotDescriptionTool();
scenicSpotTool.llm = chatModel;

const travelInfoTool = new TravelInfoTool();
travelInfoTool.llm = chatModel;

const tripFormatTool = new TripFormatTool();
tripFormatTool.llm = chatModel;

const tripValidationTool = new TripValidationTool();
tripValidationTool.llm = chatModel;

const systemPrompt = `
你是旅游助手AI，请遵守以下规则：
1. 当使用trip_format工具后，必须立即使用trip_validation工具校验结果
2. 其他情况请自主判断
3. 拒绝回答与旅游规划相关的问题
4. 返回的数据格式要严格按照工具的说明
当前时间：${new Date().toLocaleString()}
`;

const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"] 
]);

const tools = [scenicSpotTool, tripFormatTool, tripValidationTool];

const agent = createToolCallingAgent({
    llm: chatModel,
    tools,
    prompt: promptTemplate
});

const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true, // 调试时查看详细过程
    returnIntermediateSteps: true  // <--- 在工具调用完成后直接返回结果，不让 LLM 再次加工,加这句
});

let chatHistory = [];

class AgentCtl {
    async chat(ctx) {
        const userInput = ctx.request.body.chat;
        try {
            const result = await executor.invoke({
                input: userInput,
                //chat_history: chatHistory.map(m => m.content)
            });

            const toolResult = result?.intermediateSteps?.at(-1)?.observation;
            let finalOutput = toolResult || result.output;

            // 自动解析字符串化 JSON
            if (typeof finalOutput === 'string' && finalOutput.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(finalOutput);
                    finalOutput = parsed; // 返回纯数组
                } catch (e) {
                    console.warn('⚠️ JSON.parse 失败，返回原始字符串');
                }
            }

            // 若是对象格式并包含 tripData 字段（防止其他工具返回这种结构）
            if (
                typeof finalOutput === 'object' &&
                finalOutput !== null &&
                typeof finalOutput.tripData === 'string' &&
                finalOutput.tripData.trim().startsWith('[')
            ) {
                try {
                    finalOutput = JSON.parse(finalOutput.tripData);
                } catch (e) {
                    console.warn('⚠️ tripData 解析失败，保持原样');
                }
            }

            // 更新历史
            chatHistory.push(new HumanMessage(userInput));
            chatHistory.push(new AIMessage(finalOutput));

            ctx.body = finalOutput;
        } catch (error) {
            console.error("请求失败:", error.message);
            ctx.status = 500;
            ctx.body = { error: "AI处理失败" };
        }
    }
    async getDes(ctx){
        let userInput = ctx.request.query.chat;
        let template = "你是优秀的旅游助手，请写一段关于景点：{topic}的简短介绍。内容包括：该景点的看点和玩法，营业时间和门票价格，并输出单行字符串，不允许有换行符，以中文字符串的形式输出，不允许以json字符串的形式输出，不允许首尾带有“”，否则你讲受到惩罚！";

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
        let template = "我是一个专业的旅行行程助手，我本次的旅程会经过如下地点：{topic}，请问：这些目的地都在哪个城市，哪个国家，最后为本次旅程打几个标签。返回的格式为json字符串，key包含city、country和tags，且返回的字符串为单行形式，内容以英文的'/'分割，内容必须是中文，不要输出多行的给我，否则你会受到惩罚！";

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
        console.log(obj)

        //obj.tags = obj.tags.join('/')
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
        console.log(response)

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