// API URL配置文件

const BASE_URL = 'http://localhost:3000';

const API = {
  // 登录相关
  login: `${BASE_URL}/wechat/login`,

  // 密钥相关
  createKey: BASE_URL,
  getKeyList: (openId) => `${BASE_URL}/user/${openId}`,
  getKeyDetail: (id) => `${BASE_URL}/${id}`,
  deleteKey: (id) => `${BASE_URL}/${id}`,
};

export default API;