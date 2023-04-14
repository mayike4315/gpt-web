<template>
  <!-- 弹窗 -->
  <div v-if="show">
    <div class="dialog">
      <h3>{{ name }}</h3>
      <p>{{ message }}</p>
    </div>
    <div class="overlay"></div>
  </div>
</template>

<script>
export default {
  props: {
    show: {
      type: Boolean,
      default: false
    },
    name: {
      type:  String,
      default: '提示'
    },
    message:{
      type:  String,
      default:'输入不能为空'
    }
  }
}
</script>

<style scoped>
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
  width: 26%;

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
</style>
