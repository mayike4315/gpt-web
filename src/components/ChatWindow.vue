<template>
  <div class="chat-container">
    <div class="chat-header">{{ title }}
      <button @click="saveAsMarkdownFile" class="left">
        <img src="@/assets/export.png"/>
      </button>
      <button @click="restore" class="right">
        <img src="@/assets/restore.png"/>
      </button>
    </div>
    <div class="chat-message" ref="messagesContainer">
      <div v-for="(message,index) in messages" :key="message.id"
           :class="{ 'sent-message': message.sent, 'received-message': !message.sent }">

        <div class="imgLeft" v-if="!message.sent">
          <img class="img" :src="receiveAvatar"/>
          <span class="time">{{ message.time }}</span>
          <img class="del" v-if="index !== 0" src="@/assets/del.png" @click="deleteDataByKey(message.key)"/>
        </div>
        <div class="imgRight" v-if="message.sent">
          <img class="del" src="@/assets/del.png" @click="deleteDataByKey(message.key)"/>
          <span class="time">{{ message.time }}</span>
          <img class="img" :src="sendAvatar"/>
        </div>

        <div class="content">
          <div class="markdown-body" v-html="message.content"></div>
        </div>

      </div>
      <div v-if="isGenerating" class="isGenerating">
        <a @click="stopHanldChange">Stop generating</a>
      </div>
      <div class="thinking" v-show="isThinking">
        <div class="thinking-text">正在思考中...</div>
      </div>
    </div>
    <div class="chat-input">
      <textarea  v-model="inputMessage" @keydown.enter.prevent="sendMessage"
                placeholder="Type your message, Ctrl+Enter enables multiple lines of input"></textarea>
      <button @click="sendMessage" :disabled="isGenerating"
              :class="buttonSend ? 'buttonSend' : 'buttonReceived'">
        <img src="@/assets/send.png" v-if="buttonSend"/>
        <img src="@/assets/received.png" v-if="!buttonSend" alt=""/>
      </button>
    </div>
    <!-- 弹窗 -->
    <AlertModal ref="alertModal" :duration="1000" :hasButtons="hasButtons"/>




  </div>
</template>

<script>
import {EventSourcePolyfill} from 'event-source-polyfill'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/devibeans.css'
import defaultAvatar from '@/assets/avatar.jpg'
import chatAvatar from '@/assets/pwa-192x192.png'
import ClipboardJS from 'clipboard'; //复制粘贴
import {saveAs} from 'file-saver';
import Api from '@/api'
import AlertModal from "@/components/AlertModal";
import { openDatabase, addNewMessage, getAllMessages,delMessage } from '@/api/db';


const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="hljs" style="position:relative;"><code>'
            + hljs.highlight(lang, str, true).value +
            '</code></pre>';
      } catch (err) {
        console.log(err)
      }
    }
    return '<pre class="hljs" style="position:relative;"><code>' + hljs.highlightAuto(str).value + '</code></pre>';
  }
})

export default {
  components: {AlertModal},
  data() {
    return {
      show: false,
      isStop: false, //是否停止输出
      message: '',
      buttonSend: true,
      isGenerating: false,
      title: 'GPT在线',
      messages: [],
      inputMessage: '',
      currentReceiveMsg: {uid: this.uid, content: ''},
      uid: '',
      sendAvatar: defaultAvatar,
      receiveAvatar: chatAvatar,
      eventSource: null,
      isThinking: false,
      hasButtons:false
    }
  },
  methods: {
    //ctrl+center换行
    insertNewLine() {
      const textarea = event.target
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const value = textarea.value
      textarea.value = value.substring(0, start) + '\n' + value.substring(end)
      textarea.selectionStart = textarea.selectionEnd = start + 1
      this.content = textarea.value
    },
     // 创建消息对象
    createMessageObj(content, sent = true) {
      const message = {
        content,
        uid: this.uid,
        time: new Date().toLocaleString(),
        sent
      };
      return message;
    },
    //发送消息逻辑
    sendMessage(event) {
      if (!this.inputMessage) {
        this.showConfirmDialog("发送内容不能为空")
        return
      }
      //ctrl+enter换行不提交
      if (event.ctrlKey) {
        this.insertNewLine()
        return;
      }
      if (this.isGenerating) {
        return
      }

      this.isStop = false
      this.isThinking = true

      //检查sse状态
      this.checkEventState()
      const message = this.createMessageObj(this.inputMessage, true);
      this.messages.push(message)
      this.addMessage(message);
      // 向服务端发送消息
      this.chat()
      this.scrollTop();
    },
    //sse连接
    connectSse() {
      //发起sse请求
      this.eventSource = new EventSourcePolyfill(Api.baseURL + 'createSse', {
        headers: {
          'uid': this.uid
        },
        heartbeatTimeout: 360000, // 设置超时时间
      })
    },
    //sse事件监听方法，只初始化一次（sse自动重新连接时，之前添加的addEventListener监听方法会自动重新绑定到新的sse对象上）
    listenForSse() {
      console.log("addEventListener……")
      const self = this;
      let content = ''

      //和后台连接成功
      this.eventSource.addEventListener("open", (event) => {
        console.log('open successfully', event)
      })

      //自定义监听事件，和openai成功建立连接时触发
      this.eventSource.addEventListener("data",  async (event) => {
        console.log('OpenAI建立sse连接 successfully', event)
        this.buttonSend = false
        this.isGenerating = true
        this.isThinking = false
        this.currentReceiveMsg = {
          uid: 'chatGpt',
          time: new Date().toLocaleString(),
          content: ''
        }
        this.messages.push(Object.assign({}, this.currentReceiveMsg)) // 新增一条聊天记录
      })

      this.eventSource.addEventListener('message',  async (event) => {
        //停止输出
        if (self.isStop) {
          if (!this.currentReceiveMsg.content) return;
          // 保存到数据库
          await this.addMessage(this.currentReceiveMsg);
          return
        }
        if (event.data === "[DONE]") { //文字结束
          self.isGenerating = false
          self.buttonSend = true,
          this.copy()
          content = ''
          console.log("msg接收完毕")
          // 保存到数据库
          await this.addMessage(this.currentReceiveMsg);
          return;
        }
        const message = JSON.parse(event.data)
        if (message.content == null || message.content === 'null') {
          content = '';
          return;
        }
        content = `${content}${message.content}`; // 将收到的新消息拼接起来
        const renderText = md.render(content); // 将拼接后的消息渲染成 Markdown 格式
        const lastMsgIndex = this.messages.length - 1;
        this.messages[lastMsgIndex].content = renderText; // 添加到最后一条聊天记录中
        this.currentReceiveMsg.content = renderText; // 拼接消息内容

        this.scrollTop();
      })

      this.eventSource.addEventListener("error", (err) => {
        console.log("err", err)
        if (err.error && err.error.message.indexOf('activity')>0){
          this.close();
        }else {
          this.showConfirmDialog("网络异常请稍后再试")
        }
        console.log('errReadyState:', this.eventSource.readyState);
        this.eventSource.close()
        this.isThinking=false
        console.log('errReadyState1:', this.eventSource.readyState);
      })
    },
    //检查sse状态
    checkEventState() {
      if (this.eventSource.readyState === EventSource.CONNECTING) {
        console.log("event  connecting ……,current state", this.eventSource.readyState)
        setTimeout(() => {
        }, 1000)
      } else if (this.eventSource.readyState === EventSource.CLOSED) {
        console.log("event is closed,start connect ……,current state", this.eventSource.readyState)
        this.close()
        setTimeout(() => {
          this.connectSse();
          this.listenForSse()
        }, 2000)
      }
    },
    //复制方法
    copy() {
      const markdownDivs = document.querySelectorAll('.hljs');
      markdownDivs.forEach(function (div) {
        if (div.getElementsByTagName("button").length > 0) {
          return
        }
        // 创建一个新的按钮元素
        const button = document.createElement('button');
        button.textContent = 'copy';
        button.setAttribute("style", "position: absolute;" +
            "right: 10px;top: 10px;background-color: #3e3f40;" +
            "color: #fff;border: none;border-radius: 5px;" +
            "padding: 8px;cursor: pointer;");
        // 将按钮添加到div元素中
        div.appendChild(button);
        // 创建一个新的ClipboardJS实例
        const clipboard = new ClipboardJS(button, {
          // 将要复制的内容作为回调函数的返回值
          text: function () {
            return div.textContent.replace("copied", "");
          }
        });

        // 监听复制成功事件
        clipboard.on('success', function (e) {
          console.log('复制成功：' + e.text);
          e.trigger.innerText = 'copied'
        });

        // 监听复制失败事件
        clipboard.on('error', function (e) {
          console.log('复制失败：' + e.text);
        });
      });
    },
    //停止输出
    stopHanldChange() {
      this.isStop = true
      this.isGenerating = false;
      this.close();
    },
    //继续
    regenerateHanldChange() {
      this.inputMessage = '继续'
      this.isGenerating = true;
      this.sendMessage()
    },
    //唯一uid
    getUid() {
      let uid = window.localStorage.getItem("uid");
      if (uid == null || uid === '' || uid === 'null') {
        this.uid = Math.random().toString(36).substring(7);
        window.localStorage.setItem("uid", this.uid);
      } else {
        this.uid = uid;
      }
    },
    //滚动到最低端
    scrollTop() {
      this.$nextTick(() => {
        const container = this.$refs.messagesContainer
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      })
    },
    //发送消息
    chat() {
      Api.chat({msg: this.inputMessage}).then(response => {
        console.log(response.data)
        // 发送成功后清空输入框
        this.inputMessage = ''
      }).catch((error) => {
        console.log('服务端断开连接，开始尝试重连',error);
        // this.promptMessage("服务端断开连接，开始尝试重连")
        this.showConfirmDialog("服务端断开连接，开始尝试重连")
        this.currentReceiveMsg.content=''
        this.eventSource.close();
        setTimeout(() => {
          this.connectSse();
          this.listenForSse()
        }, 1000)
        this.isThinking=false
      });
    },
    //关闭后台链接
    close() {
      Api.close().then(function (response) {
        console.log(response);
      })
    },
    //页面即将被卸载时被调用
    handleBeforeUnload() {
      this.close()
    },
    //导出markdown文件
    async saveAsMarkdownFile() {
      // const jsoMsg = JSON.parse(localStorage.getItem("msg" + this.uid));
      const result = await getAllMessages();
      if (result == null) {
        // this.promptMessage("还没有生成数据，请稍后再试")
        await this.showConfirmDialog("还没有生成数据，请稍后再试")
        return
      }
      // 使用模板字符串构建Markdown文本
      const mdText = `# 用户:` + this.uid + `\n\n` + result.map(item => `##   ${item.time}\n${item.content}\n\n`).join('');
      const blob = new Blob([mdText], {type: 'text/markdown;charset=utf-8'});
      saveAs(blob, 'chatFile-' + this.uid + '.md');
    },
    async getMessages() {
        const messages = await getAllMessages();
        this.messages = messages;
        if (this.messages.length === 0) {
          const message = this.createMessageObj('欢迎使用GPT-WEB，点击下方输入框输入问题可实现与AI连续对话！！！', false);
          this.messages.push(message)
          await this.addMessage(message)
        }
    },

    async addMessage(messages) {
      //新增数据并且返回主键key
      let key = await addNewMessage(messages);
      messages.key = key
    },
    //恢复历史记录
    async restore() {
      try {
        this.hasButtons=true
        await this.showConfirmDialog(
            '此功能只针对旧版对话记录做数据恢复，切记只需点击恢复一次即可，切勿重复使用, 如需使用请点击确定！！！',
            () => {
              console.log('数据恢复');
              const jsoMsg = JSON.parse(localStorage.getItem("msg" + this.uid));
              jsoMsg.forEach(e => {
                e.uid = e.id
                this.addMessage(e)
              })
              this.getMessages() //刷新数据
              this.hasButtons=false
              this.showConfirmDialog("数据恢复完成")
              //滚动到最低端
              this.scrollTop();
            }
        );
      } catch (err) {
        this.hasButtons=false
        console.log('取消操作');
      }
    },
    //删除某一条记录
    async deleteDataByKey(key) {
      await delMessage(key);
      await this.getMessages() //刷新数据
    },
    //提示弹框
    async showConfirmDialog(msg,confirm) {
      if (!this.hasButtons) { // 如果没有按钮，直接弹出提示信息
        this.$refs.alertModal.emitter.emit('open', { message: msg });
        return;
      }
      return new Promise((resolve, reject) => {
        const confirmListener = () => {
          confirm(); // 执行删除等操作
          resolve();
        };
        const cancelListener = () => {
          reject(); // 中断操作
        };

        this.$refs.alertModal.emitter.on('confirm', confirmListener);
        this.$refs.alertModal.emitter.on('cancel', cancelListener);

        this.$refs.alertModal.emitter.emit('open', { message: msg,hasButtons:true});
      });
    },
  },
  async mounted() {
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    //获取历史记录数据
    await this.getMessages()
    //添加监听事件
    this.listenForSse()
    //滚动到最低端
    this.scrollTop();
  },
  async created() {
    //获取到用户id 模拟登陆
    this.getUid();
    //发送sse请求链接
    this.connectSse()
    // 初始化数据库
    await openDatabase();
  },
}
</script>

<style scoped lang="less">
@import '../assets/css/github-markdown-dark.css';

.chat-container {
  display: flex;
  flex-direction: column;
  height: 98vh;
}

.chat-header {
  padding: 5px 0 10px;
  text-align: center;
  font-size: 20px;
  font-weight: bold;
  color: rgb(255, 255, 255);
  position: relative;

  button {
    position: absolute;
    bottom: 20%;
    cursor: pointer;
    background-color: #444654;
    border: none;
    border-radius: 5px;

  }
  .left{
    left: 1%;
  }
  .right{
    right: 1%;
  }
  img{
    width: 25px;
    height:25px;
  }
}

.chat-message {
  flex: 1;
  overflow-y: auto;
  justify-content: flex-start;
}

.sent-message {
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
  background-color: #383a49;
  color: #fff;
  padding: 10px;
  border-radius: 10px;
  white-space: pre-wrap;
  .content {
    display: flex;
    align-items: center;
    justify-content: flex-end;

    .markdown-body {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      overflow: auto;
      line-height: 1.45;
      border-radius: 6px;
      width: 50%;
      font-size: 16px;
    }
  }
}
.markdown-body {
      max-width: 100%;
}

.received-message {
  display: flex;
  flex-direction: column;
  padding: 10px;
  background-color: #343541;
  color: #ececf1;
  border-radius: 10px;
  margin-bottom: 10px;

  .content {
    display: flex;
  }
}

.chat-input {
  display: flex;
  align-items: center;
  margin: 0 2%;
  position: relative;

  img {
    width: 35px;
    height: 35px;
    border-radius: 50%;
    cursor: pointer;
  }
}

.chat-input textarea {
  resize: none;
  padding: 10px 34px 10px 10px;
  border: none;
  border-radius: 5px;
  font-size: 16px;
  width: 100%;
}

.chat-input button {
  background-color: #fff;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  position: absolute;
  right: 0px;
  top: 9px;
}

.chat-input {
  .buttonSend {
    background-color: #fff;
  }
}

.chat-input {
  .buttonReceived {
    background-color: #fff;
  }
}

.imgLeft {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: left;

  img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }
  .del{
    width: 25px;
    height: 25px;
  }

  .time {
    padding: 0 10px;
  }
}

.imgRight {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: flex-end;

  img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    margin-left: 10px;
  }

  .del{
    width: 25px;
    height: 25px;
    margin-right: 10px;
  }

  .time {
    color: #999;
  }
}

.isGenerating {
  display: flex;
  justify-content: center;
  /* 水平居中 */
  align-items: center;
  /* 垂直居中 */
  padding: 1% 0;
  border-top: 1px solid #ccc;

  a {
    cursor: pointer;
    color: #fff;
    border: 1px solid #707073;
    border-radius: 3px;
    padding: 5px 10px;
  }
}

.thinking {
  display: flex;
  justify-content: center;
  /* 水平居中 */
  align-items: center;
  /* 垂直居中 */
  padding: 1% 0;
  border-top: 1px solid #ccc;
}

.thinking-text {
  color: #fff;
  border-radius: 3px;
  padding: 5px 10px;
}
</style>
