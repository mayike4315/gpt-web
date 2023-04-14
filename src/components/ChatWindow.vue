<template>
  <div class="chat-container">
    <div class="chat-header">{{ title }}
      <button @click="saveAsMarkdownFile">导出</button>
    </div>
    <div class="chat-message" ref="messageContainer">
      <div v-for="message in messages" :key="message.id"
           :class="{ 'sent-message': message.sent, 'received-message': !message.sent }">

        <div class="imgLeft" v-if="!message.sent">
          <img class="img" :src="receiveAvatar"/>
          <span class="time">{{ message.time }}</span>
        </div>
        <div class="imgRight" v-if="message.sent">
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
      <textarea v-model="inputMessage" @keydown.enter.prevent="sendMessage"
                placeholder="Type your message, Ctrl+Enter enables multiple lines of input"></textarea>
      <button @click="sendMessage" :disabled="isGenerating"
              :class="buttonSend ? 'buttonSend' : 'buttonReceived'">
        <img src="@/assets/send.png" v-if="buttonSend"/>
        <img src="@/assets/received.png" v-if="!buttonSend" alt=""/>
      </button>
    </div>
    <!-- 弹窗 -->
    <propBox :message="message" :show="show"></propBox>

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
import propBox from "@/components/PropBox";


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
  components: {propBox},
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
      currentReceiveMsg: {id: this.uid, content: ''},
      uid: '',
      sendAvatar: defaultAvatar,
      receiveAvatar: chatAvatar,
      eventSource: null,
      isThinking: false
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
    //弹窗提示
    promptMessage(info) {
      this.show = true
      this.message = info
      //3秒自动消失提示
      if (this.show) {
        setTimeout(() => {
          this.show = false
        }, 3000)
      }
    },
    //发送消息逻辑
    sendMessage(event) {
      if (!this.inputMessage) {
        this.promptMessage()
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
      //处理历史消息
      if (this.currentReceiveMsg.content) {
        let historyMsg = {...this.currentReceiveMsg}
        this.messages.splice(-1, 1)
        this.messages.push(historyMsg)
      }
      this.isStop = false
      this.isThinking = true
      //检查sse状态
      this.checkEventState()
      this.messages.push({
        "content": this.inputMessage,
        "id": this.uid,
        'time': new Date().toLocaleString(),
        'sent': true
      })
      // 向服务端发送消息
      this.chat()
      setTimeout(() => {
        this.scrollTop()
      }, 1000)
    },
    //sse连接
    connectSse() {
      //发起sse请求
      this.eventSource = new EventSourcePolyfill(Api.baseURL + 'createSse', {
        headers: {
          'uid': this.uid
        },
        heartbeatTimeout: 120000, // 设置超时时间
      })
    },
    //sse事件监听方法，只初始化一次（sse自动重新连接时，之前添加的addEventListener监听方法会自动重新绑定到新的sse对象上）
    listenForSse() {
      console.log("addEventListener……")
      const self = this;
      this.currentReceiveMsg.content = ''
      let content = ''
      //和后台连接成功
      this.eventSource.addEventListener("open", event => {
        console.log('open successfully', event)
      })

      //自定义监听事件，和openai成功建立连接时触发
      this.eventSource.addEventListener("data", event => {
        console.log('OpenAI建立sse连接 successfully', event)
        this.buttonSend = false,
        this.isGenerating = true
        this.isThinking = false
        this.currentReceiveMsg.id = 'chatGpt'
        this.currentReceiveMsg.time = new Date().toLocaleString()
        //新增一条收件消息 记录
        this.messages.push(this.currentReceiveMsg);
      })

      this.eventSource.addEventListener('message', event => {
        //停止输出
        if (self.isStop) {
          localStorage.setItem("msg" + this.uid, JSON.stringify(this.messages))
          return
        }
        if (event.data === "[DONE]") { //文字结束
          self.isGenerating = false
          self.buttonSend = true,
              this.copy()
          content = ''
          console.log("msg接收完毕")
          localStorage.setItem("msg" + this.uid, JSON.stringify(this.messages))
          return;
        }
        const message = JSON.parse(event.data)
        if (message.content == null || message.content === 'null') {
          content = '';
          return;
        }
        content = content + message.content
        this.currentReceiveMsg.content = md.render(content)
        this.scrollTop();
      })

      this.eventSource.addEventListener("error", err => {
        console.log("err", err.error)
        console.log('errReadyState:', this.eventSource.readyState);
      })
    },
    checkEventState() {
      if (this.eventSource.readyState === EventSource.CONNECTING) {
        console.log("event  connecting ……,current state", this.eventSource.readyState)
        setTimeout(() => {
        }, 1000)
      } else if (this.eventSource.readyState === EventSource.CLOSED) {
        console.log("event is closed,start connect ……,current state", this.eventSource.readyState)
        this.close()
        this.connectSse()
        setTimeout(() => {
        }, 1000)
      }
    },
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
    getUid() {
      let uid = window.localStorage.getItem("uid");
      if (uid == null || uid === '' || uid === 'null') {
        this.uid = Math.random().toString(36).substring(7);
        window.localStorage.setItem("uid", this.uid);
      } else {
        this.uid = uid;
      }
    },
    scrollTop() {
      const messageContainer = this.$refs.messageContainer;
      messageContainer.scrollTop = messageContainer.scrollHeight;
    },
    chat() {
      Api.chat({msg: this.inputMessage}).then(response => {
        console.log(response.data)
        // 发送成功后清空输入框
        this.inputMessage = ''
      })
    },
    close() {
      Api.close().then(function (response) {
        console.log(response);
      })
    },
    //刷新页面时关闭后台连接
    handleBeforeUnload() {
      this.close()
    },
    //导出markdown文件
    saveAsMarkdownFile() {
      const jsoMsg = JSON.parse(localStorage.getItem("msg" + this.uid));
      if (jsoMsg.length === 0) {
        this.promptMessage("还没有生成数据，请稍后再试")
        return
      }
      // 使用模板字符串构建Markdown文本
      const mdText = `# 用户:` + this.uid + `\n\n` + jsoMsg.map(item => `##   ${item.time}\n${item.content}\n\n`).join('');
      const blob = new Blob([mdText], {type: 'text/markdown;charset=utf-8'});
      saveAs(blob, 'chatFile-' + this.uid + '.md');
    }
  },
  mounted() {
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    if (this.messages.length === 0) {
      this.messages.push({
        "content": '欢迎使用GPT-WEB，点击下方输入框输入问题可实现与AI连续对话！！！',
        "id": this.uid,
        time: new Date().toLocaleString()
      })
    }
    this.scrollTop();
    this.listenForSse()
  },
  created() {
    this.getUid();
    if (localStorage.getItem("msg" + this.uid)) {
      this.messages = JSON.parse(localStorage.getItem("msg" + this.uid))
    }
    this.connectSse()
  }
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
  padding: 1% 0;
  text-align: center;
  font-size: 20px;
  font-weight: bold;
  color: rgb(255, 255, 255);
  position: relative;

  button {
    position: absolute;
    right: 20px;
    bottom: 20%;
    cursor: pointer;
    background-color: #696a7d;
    color: #fff;
    border: none;
    border-radius: 5px;
    padding: 5px 10px;

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

  .time {
    padding-left: 10px;
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
