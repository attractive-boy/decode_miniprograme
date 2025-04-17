// pages/decode/decode.js
const CryptoJS = require('crypto-js');
import { TextDecoder } from '../../miniprogram_npm/text-decoding/index';

Page({
  /**
   * 页面的初始数据
   */
  data: {
    inputText: '',
    decryptedText: '',
    showResult: false,
    loading: false,
    keyList: [],
    keyOptions: [],
    selectedKeyIndex: -1,
    showPasswordDialog: false,
    showKeyPicker: false,
    password: '',
    sharedSecretBase64: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadKeyList();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const page = getCurrentPages().pop();
      this.getTabBar().setData({
        value: '/' + page.route
      })
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  // 密文输入事件处理
  onInputChange(e) {
    this.setData({
      inputText: e.detail.value
    });
  },

  // 私钥输入事件处理 - 已删除，使用密钥选择替代
  // onSecretKeyChange(e) {
  //   this.setData({
  //     secretKey: e.detail.value
  //   });
  // },

  // 加载密钥列表
  loadKeyList() {
    const keyList = wx.getStorageSync('keyList') || [];
    // 转换为picker需要的格式
    const keyOptions = keyList.map((key, index) => ({
      label: key.name,
      value: index
    }));
    this.setData({
      keyList,
      keyOptions
    });
  },

  // 显示密钥选择器
  showKeyPicker() {
    console.log("call showKeyPicker")
    this.setData({
      showKeyPicker: true
    });
  },

  // 密钥选择器变更事件
  onKeyPickerChange(e) {
    const {
      value
    } = e.detail;
    this.setData({
      selectedKeyIndex: value[0],
      showKeyPicker: false
    });
  },

  // 密钥选择器取消事件
  onKeyPickerCancel() {
    this.setData({
      showKeyPicker: false
    });
  },

  // 密钥选择器选择事件
  onKeyPick(e) {
    const {
      value
    } = e.detail;
  },

  // 私钥相关方法已替换为密钥选择功能

  // 显示密码输入对话框
  showPasswordDialog() {
    if (this.data.selectedKeyIndex === -1) {
      wx.showToast({
        title: '请先选择密钥',
        icon: 'none'
      });
      return;
    }

    this.setData({
      showPasswordDialog: true,
      password: ''
    });
  },

  // 密码输入事件处理
  onPasswordInput(e) {
    this.setData({
      password: e.detail.value
    });
  },

  // 取消密码输入
  onCancelPassword() {
    this.setData({
      showPasswordDialog: false,
      password: ''
    });
  },

  // 确认密码输入
  onConfirmPassword() {
    if (!this.data.password) {
      wx.showToast({
        title: '请输入密码',
        icon: 'none'
      });
      return;
    }
    this.setData({
      showPasswordDialog: false
    });
    this.decodeText();
  },

  // 复制文本到剪贴板
  copyText() {
    wx.setClipboardData({
      data: this.data.decryptedText,
      success: () => {
        wx.showToast({
          title: '复制成功',
          icon: 'success',
          duration: 2000
        });
      }
    });
  },

  // 解密文本
  async decodeText() {
    if (!this.data.inputText) {
      wx.showToast({
        title: '请输入需要解密的文字',
        icon: 'error'
      });
      return;
    }

    if (this.data.selectedKeyIndex === -1) {
      wx.showToast({
        title: '请选择密钥',
        icon: 'error'
      });
      return;
    }

    if (!this.data.password) {
      wx.showToast({
        title: '请输入密码',
        icon: 'error'
      });
      return;
    }

    this.setData({
      loading: true
    });


    // 解析输入的密文 - 直接从Base64解码
    const encryptedBytes = wx.base64ToArrayBuffer(this.data.inputText);
    const encryptedArray = new Uint8Array(encryptedBytes);

    // 获取选中的密钥
    const selectedKey = this.data.keyList[this.data.selectedKeyIndex];

    // 使用密码解密私钥
    let decryptedSecretKey;
    try {
      // 检查密钥是否包含盐值和IV（新格式）
      if (selectedKey.salt && selectedKey.iv) {
        // 使用PBKDF2从密码派生密钥
        const salt = CryptoJS.enc.Hex.parse(selectedKey.salt);
        const iv = CryptoJS.enc.Hex.parse(selectedKey.iv);
        
        const derivedKey = CryptoJS.PBKDF2(this.data.password, salt, {
          keySize: 256/32,
          iterations: 10000
        });
        
        // 使用CBC模式解密
        decryptedSecretKey = CryptoJS.AES.decrypt(
          selectedKey.secretKey,
          derivedKey, {
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
            iv: iv
          }
        ).toString(CryptoJS.enc.Utf8);
      } else {
        // 兼容旧格式（直接使用密码作为密钥，ECB模式）
        const key = CryptoJS.enc.Utf8.parse(this.data.password);
        decryptedSecretKey = CryptoJS.AES.decrypt(
          selectedKey.secretKey,
          key, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7
          }
        ).toString(CryptoJS.enc.Utf8);
      }
      
      if (!decryptedSecretKey) {
        throw new Error('密码错误或密钥格式不正确');
      }
    } catch (error) {
      console.error('解密私钥失败:', error);
      wx.showToast({
        title: '密码错误',
        icon: 'error'
      });
      this.setData({
        loading: false
      });
      return;
    }

    // 初始化WASM
    const importObject = {
      env: {
        js_random_bytes: (outPtr, outLen) => {
          const randomArray = new Uint8Array(outLen);
          wx.getRandomValues(randomArray);
          const memory = instance.exports.memory;
          const heap = new Uint8Array(memory.buffer);
          heap.set(randomArray, outPtr);
        },
        memory: new WXWebAssembly.Memory({
          initial: 10,
          maximum: 100
        }),
        emscripten_notify_memory_growth: (memory, growth) => {
          const new_size = memory.buffer.byteLength + growth;
          memory.grow(growth);
          return new_size;
        }
      }
    };

    let instance;
    const wasmModule = await WXWebAssembly.instantiate("/wasm/kyber.wasm", importObject);
    instance = wasmModule.instance;
    const memory = instance.exports.memory;

    // 获取密文和密钥的大小
    const secKeySize = instance.exports.get_secret_key_size();
    const ciphertextSize = instance.exports.get_ciphertext_size();
    const sharedSecretSize = instance.exports.get_shared_secret_size();
    
    // 计算消息长度 (总长度减去密文长度)
    const messageLength = encryptedArray.length - ciphertextSize;

    // 分配内存
    const secKeyPtr = instance.exports.my_malloc(secKeySize);
    const ciphertextPtr = instance.exports.my_malloc(ciphertextSize);
    const sharedSecretPtr = instance.exports.my_malloc(sharedSecretSize);

    try {
      // 将私钥和密文复制到WASM内存
      const secKeyBytes = wx.base64ToArrayBuffer(decryptedSecretKey);
      const secKeyHeap = new Uint8Array(memory.buffer, secKeyPtr, secKeySize);
      secKeyHeap.set(new Uint8Array(secKeyBytes));

      // 从合并的数据中提取密文部分
      const ciphertextPart = encryptedArray.slice(0, ciphertextSize);
      const ciphertextHeap = new Uint8Array(memory.buffer, ciphertextPtr, ciphertextSize);
      ciphertextHeap.set(ciphertextPart);

      // 解密共享密钥
      const decResult = instance.exports.decrypt(sharedSecretPtr, ciphertextPtr, secKeyPtr);
      if (decResult !== 0) throw new Error('解密失败');

      // 获取共享密钥
      const sharedSecret = new Uint8Array(memory.buffer, sharedSecretPtr, sharedSecretSize);

      this.setData({
        sharedSecretBase64: wx.arrayBufferToBase64(sharedSecret)
      })

      // 从合并的数据中提取加密消息部分
      const encryptedMessagePart = encryptedArray.slice(ciphertextSize);
      
      // 使用共享密钥对消息进行XOR解密
      const decryptedBytes = new Uint8Array(messageLength);
      for (let i = 0; i < messageLength; i++) {
        decryptedBytes[i] = encryptedMessagePart[i] ^ sharedSecret[i % sharedSecretSize];
      }
      
      // 将解密后的字节数组转换为文本
      const decoder = new TextDecoder();
      const decryptedText = decoder.decode(decryptedBytes);

      // 释放内存
      instance.exports.my_free(secKeyPtr);
      instance.exports.my_free(ciphertextPtr);
      instance.exports.my_free(sharedSecretPtr);

      this.setData({
        decryptedText,
        showResult: true,
        loading: false
      });
    } catch (error) {
      console.error('解密失败:', error);
      wx.showToast({
        title: '解密失败',
        icon: 'error'
      });
      this.setData({
        loading: false
      });
    }

  },
})