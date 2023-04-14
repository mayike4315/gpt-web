import axios from 'axios'

// 创建axios实例
const service = axios.create({
    baseURL: process.env.VUE_APP_API_BASE_URL, // api的base_url
    timeout: 5000 // 请求超时时间
});

// request拦截器
service.interceptors.request.use(
    config => {
        // 在请求发送之前设置header
        config.headers['uid'] = window.localStorage.getItem("uid")
        return config;
    },
    error => {
        // 请求错误处理
        console.log(error); // for debug
        Promise.reject(error);
    }
);
const api = {
    baseURL:process.env.VUE_APP_API_BASE_URL,
    chat: (params) => {
        return service.post('chat', params)
    },
    close: () => {
        return service.get('closeSse')
    }
}

export default api

