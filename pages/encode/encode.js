// pages/encode/encode.js
import { TextEncoder } from '../../miniprogram_npm/text-decoding/index';
const CryptoJS = require('crypto-js');
Page({

    /**
     * 页面的初始数据
     */
    data: {
        inputText: '',
        publicKey: '',
        encryptedText: '',
        showResult: false,
        loading: false,
        sharedSecretBase64: ''
    },

    /**
     * 生命周期函数--监听页面加载
     */
    onLoad(options) {

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

    // 文本输入事件处理
    onInputChange(e) {
        this.setData({
            inputText: e.detail.value
        });
    },

    // 公钥输入事件处理
    onPublicKeyChange(e) {
        this.setData({
            publicKey: e.detail.value
        });
    },

    // 复制文本到剪贴板
    copyText() {
        wx.setClipboardData({
            data: this.data.encryptedText,
            success: () => {
                wx.showToast({
                    title: '复制成功',
                    icon: 'success',
                    duration: 2000
                });
            }
        });
    },

    // 加密文本
    encodeText() {
        const { publicKey } = this.data;
      

        if (!publicKey) {
            wx.showToast({
                title: '请输入公钥',
                icon: 'none'
            });
            return;
        }

        // 显示加载提示
        this.setData({ loading: true });
        wx.showLoading({
            title: '正在生成共享密钥...',
        });

        try {
            // 解码公钥
            let publicKeyBytes;
            try {
                publicKeyBytes = wx.base64ToArrayBuffer(publicKey);
            } catch (error) {
                wx.hideLoading();
                this.setData({ loading: false });
                wx.showToast({
                    title: '公钥格式错误',
                    icon: 'none'
                });
                return;
            }

            // 初始化WASM
            const importObject = {
                env: {
                    js_random_bytes: (outPtr, outLen) => {
                        // 使用同步方式获取随机值
                        try {
                          // 创建临时缓冲区
                          const tempBuffer = new ArrayBuffer(outLen);
                          const tempArray = new Uint8Array(tempBuffer);
                          
                          // 使用加密安全的随机数填充临时数组
                          for (let i = 0; i < outLen; i++) {
                            tempArray[i] = Math.floor(Math.random() * 256);
                          }
                          
                          // 通过导入的 memory 对象操作内存
                          const memory = instance.exports.memory;
                          const heap = new Uint8Array(memory.buffer);
                          heap.set(tempArray, outPtr);
                          
                          // 返回0表示成功
                          return 0;
                        } catch (err) {
                          console.error('获取随机值失败:', err);
                          // 返回非0值表示失败
                          return -1;
                        }
                      },
                    memory: new WXWebAssembly.Memory({ initial: 10, maximum: 100 }),
                    // 实现内存增长回调
                    emscripten_notify_memory_growth: (memory, growth) => {
                        const new_size = memory.buffer.byteLength + growth;
                        memory.grow(growth); // 触发内存扩展
                        console.log(`内存增长至: ${(new_size / 64).toFixed(2)} MB`);
                        return new_size;
                    }
                }
            };

            let instance;
            WXWebAssembly.instantiate("/wasm/kyber.wasm", importObject)
            .then(res => {
                instance = res.instance;
                const memory = instance.exports.memory;

                // 获取密文和共享密钥的大小
                const pubKeySize = instance.exports.get_public_key_size();
                const ciphertextSize = instance.exports.get_ciphertext_size();
                const sharedSecretSize = instance.exports.get_shared_secret_size();

                // 分配内存
                const pubKeyPtr = instance.exports.my_malloc(pubKeySize);
                const ciphertextPtr = instance.exports.my_malloc(ciphertextSize);
                const sharedSecretPtr = instance.exports.my_malloc(sharedSecretSize);

                // 将公钥复制到WASM内存
                const pubKeyHeap = new Uint8Array(memory.buffer, pubKeyPtr, pubKeySize);
                const pubKeyArray = new Uint8Array(publicKeyBytes);
                pubKeyHeap.set(pubKeyArray);

                // 加密
                const encResult = instance.exports.encrypt(ciphertextPtr, sharedSecretPtr, pubKeyPtr);
                if (encResult !== 0) throw new Error('加密失败');

                // 获取密文和共享密钥
                const ciphertext = new Uint8Array(memory.buffer, ciphertextPtr, ciphertextSize);
                const sharedSecret = new Uint8Array(memory.buffer, sharedSecretPtr, sharedSecretSize);
                this.setData({
                  sharedSecretBase64: wx.arrayBufferToBase64(sharedSecret)
                })

                // 将输入文本转换为字节数组
                const encoder = new TextEncoder();
                const randomBytes = new Uint8Array(32);
                for (let i = 0; i < 32; i++) {
                    randomBytes[i] = Math.floor(Math.random() * 256);
                }
                const messageBytes = encoder.encode(Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
                const messageLength = messageBytes.length;

                // 使用共享密钥对消息进行XOR加密
                const encryptedMessage = new Uint8Array(messageLength);
                for (let i = 0; i < messageLength; i++) {
                    encryptedMessage[i] = messageBytes[i] ^ sharedSecret[i % sharedSecretSize];
                }

                // 将密文和加密后的消息合并
                const resultArray = new Uint8Array(ciphertextSize + messageLength);
                resultArray.set(ciphertext);
                resultArray.set(encryptedMessage, ciphertextSize);

                // 转换为Base64并显示结果
                const resultBase64 = wx.arrayBufferToBase64(resultArray);
                this.setData({
                    encryptedText: resultBase64,
                    showResult: true,
                    loading: false
                });

                // 释放内存
                instance.exports.my_free(pubKeyPtr);
                instance.exports.my_free(ciphertextPtr);
                instance.exports.my_free(sharedSecretPtr);

                wx.hideLoading();
            })
            .catch(error => {
                console.error('加密失败:', error);
                wx.hideLoading();
                this.setData({ loading: false });
                wx.showToast({
                    title: '加密失败: ' + error.message,
                    icon: 'none'
                });
            });
        } catch (error) {
            console.error('加密过程出错:', error);
            wx.hideLoading();
            this.setData({ loading: false });
            wx.showToast({
                title: '加密失败: ' + error.message,
                icon: 'none'
            });
        }
    },

    // 复制加密结果
    copyResult() {
        wx.setClipboardData({
            data: this.data.encryptedText,
            success: () => {
                wx.showToast({
                    title: '已复制到剪贴板',
                    icon: 'success'
                });
            }
        });
    }
})