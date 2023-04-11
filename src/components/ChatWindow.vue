<template>
  <div class="chat-container">
    <div class="chat-header">{{ title }}</div>
    <div class="chat-message" ref="messageContainer">
      <div v-for="message in messages" :key="message.id"
           :class="{'sent-message': message.sent, 'received-message': !message.sent}">

          <div class="imgLeft" v-if="!message.sent">
              <img class="img" :src="receiveAvatar" />
              <span class="time">{{ message.time }}</span>
          </div>
          <div class="imgRight" v-if="message.sent">
            <span class="time">{{ message.time }}</span>
            <img class="img"  :src="sendAvatar" />
          </div>

          <div class="content">
            <div class="markdown-body" v-html="message.content"></div>
          </div>
      </div>
    </div>
    <div class="chat-input">
      <textarea v-model="inputMessage" @keydown.enter.prevent="sendMessage"></textarea>
      <button @click="sendMessage" :disabled="loading"  :class="{'buttonSend': buttonSend, 'buttonReceived': buttonReceived}" >发送</button>
    </div>
    <div v-if="loading" class="loading">
      <a @click="stopHanldChange">Stop generating</a>
    </div>
    <div v-if="!loading" class="loading">
      <a  @click="regenerateHanldChange">Regenerate response</a>
    </div>

  </div>
</template>

<script>
import {EventSourcePolyfill} from 'event-source-polyfill'
import MarkdownIt from 'markdown-it'
import axios from 'axios'
import hljs from 'highlight.js'
import 'highlight.js/styles/devibeans.css'
import defaultAvatar from '@/assets/avatar.jpg'
import chatAvatar from '@/assets/pwa-192x192.png'
import ClipboardJS from 'clipboard'; //复制粘贴


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
  data() {
    return {
      flag:true, //是否停止输出
      buttonSend:true,
      buttonReceived:false,
      loading:false,
      title: 'GPT在线',
      messages: [],
      inputMessage: '',
      currentReceiveMsg: {id: this.uid, content: ''},
      uid: '',
      sendAvatar:defaultAvatar,
      receiveAvatar:chatAvatar
    }
  },
  methods: {
    sendMessage() {
      if (!this.inputMessage) {
        alert("输入不能为空")
        return
      }
      this.flag = true
      if(this.loading){
          return
      }
      if (this.currentReceiveMsg.content) {
        let historyMsg = {...this.currentReceiveMsg}
        this.messages.splice(-1, 1)
        this.messages.push(historyMsg)
      }
      this.messages.push({"content": this.inputMessage, "id": this.uid, time: new Date().toLocaleString(), sent: true})
      // 发送消息的逻辑
      this.listenForMessages()
      // 发送成功后清空输入框
      this.inputMessage = ''
    },
    listenForMessages() {
      const self = this;
      this.currentReceiveMsg.content = ''
      let content = ''
      const eventSource = new EventSourcePolyfill(process.env.VUE_APP_API_BASE_URL+'chat?message=' + this.inputMessage, {
        headers: {
          'uid': this.uid
        }
      })
      eventSource.addEventListener("open", event => {
        console.log('open successfully', event)
        // 添加到消息列表
        self.buttonSend = false,
        self.buttonReceived = true,
        self.loading = true
        self.currentReceiveMsg.id = self.uid
        self.currentReceiveMsg.time=new Date().toLocaleString()
        this.messages.push(this.currentReceiveMsg);
      })

      eventSource.addEventListener('message', event => {
        //结束
        if(!self.flag){
          return
        }
        if (event.data === "[DONE]") { //文字结束
          self.loading = false
          self.buttonSend = true,
          self.buttonReceived = false,
          this.copy()
          content = ''
          if (eventSource) {
            eventSource.close();
          }
          localStorage.setItem("messages",JSON.stringify(this.messages))
          return;
        }
        const message = JSON.parse(event.data)
        if (message.content == null || message.content === 'null') {
          content = '';
          return;
        }
        content = content + message.content
        this.currentReceiveMsg.content = md.render(content)
        const messageContainer = this.$refs.messageContainer;
        messageContainer.scrollTop = messageContainer.scrollHeight;
      })

      eventSource.addEventListener("error", err => {
        if(err.type  === 'error'){ //错误关闭掉
          eventSource.close()
        }
      })

    },
    copy() {
        const markdownDivs = document.querySelectorAll('.hljs');
        markdownDivs.forEach(function(div) {
              if (div.getElementsByTagName("button").length>0){
                return
              }
              // 创建一个新的按钮元素
              const button = document.createElement('button');
              button.textContent = 'copy';
              button.setAttribute("style", "position: absolute;right: 10px;top: 10px;background-color: #3e3f40;color: #fff;border: none;border-radius: 5px;padding: 8px;cursor: pointer;");
              // 将按钮添加到div元素中
              div.appendChild(button);
              // 创建一个新的ClipboardJS实例
              const clipboard = new ClipboardJS(button, {
                // 将要复制的内容作为回调函数的返回值
                text: function () {
                  return div.textContent.replace("copy","");
                }
              });

              // 监听复制成功事件
              clipboard.on('success', function(e) {
                console.log('复制成功：' + e.text);
                e.trigger.innerText = 'copied'
              });

              // 监听复制失败事件
              clipboard.on('error', function(e) {
                console.log('复制失败：' + e.text);
              });
            });
    },
    //停止输出
    stopHanldChange(){
      this.flag = false
      this.loading = false;
      axios.post(process.env.VUE_APP_API_BASE_URL+'/stop').then(function (response) {
        console.log(response);
      })
      .catch(function (error) {
        console.log(error);
      });
    },
    //继续
    regenerateHanldChange(){
      this.inputMessage = '继续'
      this.sendMessage()
    }
  },
  mounted() {
    this.uid = Math.random().toString(36).substring(7);
    if (this.messages.length === 0){
      this.messages.push({"content": '欢迎使用GPT-WEB，点击下方输入框输入问题可实现与AI连续对话！！！', "id": this.uid, time: new Date().toLocaleString()})
    }
  },
  created(){
    if (localStorage.getItem("messages")){
      this.messages=JSON.parse(localStorage.getItem("messages"))
    }
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
  height: 50px;
  line-height: 50px;
  text-align: center;
  font-size: 20px;
  font-weight: bold;
  color: rgb(255, 255, 255);
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
  background-color:#383a49;
  color: #fff;
  padding: 10px;
  border-radius: 10px;
  .content{
    display: flex;
    align-items: center;
    justify-content: flex-end;
    .markdown-body{
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 16px;
        overflow: auto;
        font-size: 85%;
        line-height: 1.45;
        border-radius: 6px;
        width: 50%;
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
  margin-bottom:10px;
  .content{
      display: flex;
  }
}
.chat-input {
  display: flex;
  align-items: center;
  padding: 10px;
  border-top: 1px solid #ccc;
  justify-content: flex-end;
}

.chat-input textarea {
  flex: 1;
  height: 50px;
  resize: none;
  padding: 10px;
  border: none;
  border-radius: 5px;
  margin-right: 10px;
  font-size: 16px;
}

.chat-input button {
  background-color: #007bff;
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 10px;
  cursor: pointer;
}
.chat-input {
  .buttonSend{
    background-color: #007bff;
  }
}

.chat-input {
  .buttonReceived{
    background-color: #373839;
  }
}
.imgLeft{
    height:50px;
    display: flex;
    align-items: center;
    justify-content: left;
    img {
      width: 40px;
      height:40px;
      border-radius: 50%;
    }
    .time{
      padding-left: 10px;
    }
}
.imgRight{
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    img {
      width: 40px;
      height:40px;
      border-radius: 50%;
      margin-left: 10px;
    }
    .time {
      color: #999;
    }
}

.loading{
  position: fixed;
  bottom: 140px;
  text-align: center;
  width: 100%;
  a{
    cursor: pointer;
    color: #fff;
    border:1px solid #707073;
    border-radius: 3px;
    padding: 10px;
  }
}
</style>
