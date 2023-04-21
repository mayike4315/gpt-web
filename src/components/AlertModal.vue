<template>
  <!-- 弹窗 -->
  <div v-show="visible">
    <div class="dialog">
<!--      <h3>{{ name }}</h3>-->
      <p>{{ message }}</p>
      <div class="actions" v-if="hasButtons">
        <button @click="handleConfirm" class="alert-modal-btn alert-modal-btn-confirm">确认</button>
        <button @click="handleCancel" class="alert-modal-btn alert-modal-btn-cancel">取消</button>
      </div>
    </div>
    <div class="overlay"></div>
  </div>
</template>

<script>
import mitt from 'mitt';
import { ref, onMounted } from 'vue';

export default {
  props: {
    duration: {
      type: Number,
      default: 3000,
    },
    hasButtons: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const emitter = mitt();
    const visible = ref(false);
    const message = ref('');

    // 监听 open 事件
    onMounted(() => {
      emitter.on('open', ({ message: msg,hasButtons}) => {
        message.value = msg;
        visible.value = true;
        if (!hasButtons) {
          setTimeout(() => {
            handleClose();
          }, props.duration);
        }
      });
    });

    // 发出 confirm 事件
    const handleConfirm = () => {
      handleClose();
      emitter.emit('confirm');
    };

    // 发出 cancel 事件
    const handleCancel = () => {
      handleClose();
      emitter.emit('cancel');
    };

    // 关闭弹框
    const handleClose = () => {
      visible.value = false;
    };

    return {
      emitter,
      visible,
      message,
      handleConfirm,
      handleCancel,
    };
  },
};
</script>

<style scoped lang="less">
.dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: #fff;
  padding: 15px;
  border-radius: 5px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  z-index: 999;

  h3,
  p {
    font-size: 14px;
    margin: 3% 0;
  }
}

.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 998;
}

.alert-modal-btn {
  border: none;
  outline: none;
  cursor: pointer;
  padding: 8px 16px;
  border-radius: 4px;
  margin-left: 10px;
}
.actions{
  text-align: center;
}

.alert-modal-btn-confirm {
  background-color: #007bff;
  color: #fff;
}

.alert-modal-btn-cancel {
  background-color: #dee2e6;
  color: #333;
}
</style>
