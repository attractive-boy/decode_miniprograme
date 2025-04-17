// pages/key/key.js
import CryptoJS from 'crypto-js';
import API from '../../config/api';
Page({

  /**
   * 页面的初始数据
   */
  data: {
    stickyProps: {
      zIndex: 2,
    },
    showPasswordDialog: false,
    password: '',
    keyName: '',
    keyList: [],
    refreshing: false,
    openId: '',
    currentTab: '0',
    cloudKeyList: [],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadKeyList();
    this.login();
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
    this.setData({ refreshing: true });
    this.loadKeyList();
    setTimeout(() => {
      this.setData({ refreshing: false });
      wx.stopPullDownRefresh();
    }, 1000);
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
  onTabsChange(event) {
    const tabValue = event.detail.value;
    this.setData({
      currentTab: tabValue
    });
    if (tabValue === '1') {
      this.loadCloudKeyList();
    }
  },

  onTabsClick(event) {
    console.log(`Click tab, tab-panel value is ${event.detail.value}.`);
  },

  onStickyScroll(event) {
    console.log(event.detail);
  },

  generateKey() {
    this.setData({
      showPasswordDialog: true,
      password: '',
      keyName: ''
    });
  },


  onConfirmPassword() {
    const {
      password,
      keyName,
      openId,
      currentTab
    } = this.data;
    if (!password) {
      wx.showToast({
        title: '请输入密码',
        icon: 'none'
      });
      return;
    }
    if (!keyName) {
      wx.showToast({
        title: '请输入密钥名称',
        icon: 'none'
      });
      return;
    }

    // 显示加载提示
    wx.showLoading({
      title: '正在生成密钥对...',
    });
    //生成密钥
    const importObject = {
      env: {
        js_random_bytes: (outPtr, outLen) => {
          const randomArray = new Uint8Array(outLen);
          wx.getRandomValues(randomArray);

          // 通过导入的 memory 对象操作内存
          const memory = instance.exports.memory;
          const heap = new Uint8Array(memory.buffer);
          heap.set(randomArray, outPtr);
        },
        memory: new WXWebAssembly.Memory({
          initial: 10,
          maximum: 100
        }),
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
      .then(async res => {
        instance = res.instance;
        const memory = instance.exports.memory;

        // 密钥尺寸
        const pubKeySize = instance.exports.get_public_key_size();
        const secKeySize = instance.exports.get_secret_key_size();

        // 内存分配
        const pubKeyPtr = instance.exports.my_malloc(pubKeySize);
        const secKeyPtr = instance.exports.my_malloc(secKeySize);


        // 生成密钥对
        const keygenResult = instance.exports.generate_keypair(pubKeyPtr, secKeyPtr);
        if (keygenResult !== 0) throw new Error('密钥生成失败');

        // 从WebAssembly内存中读取公钥和密钥数据
        const pubKeyData = new Uint8Array(memory.buffer, pubKeyPtr, pubKeySize);
        const secKeyData = new Uint8Array(memory.buffer, secKeyPtr, secKeySize);
        
        // 将公钥和密钥数据转换为ArrayBuffer，然后转换为Base64字符串
        const pubKeyBuffer = pubKeyData.buffer.slice(pubKeyData.byteOffset, pubKeyData.byteOffset + pubKeySize);
        const secKeyBuffer = secKeyData.buffer.slice(secKeyData.byteOffset, secKeyData.byteOffset + secKeySize);
        
        const pubKeyBase64 = wx.arrayBufferToBase64(pubKeyBuffer);
        const secKeyBase64 = wx.arrayBufferToBase64(secKeyBuffer);
        
        console.log('公钥Base64:', pubKeyBase64);
        console.log('密钥Base64:', secKeyBase64);
        
        //使用AES-256 和 密码加密密钥
        // 生成随机盐值
        const salt = CryptoJS.lib.WordArray.random(16);
        
        // 使用PBKDF2从密码派生一个32位(256位)密钥
        const key = CryptoJS.PBKDF2(password, salt, {
          keySize: 256/32, // 32字节 = 256位
          iterations: 10000
        });

        // 生成随机IV
        const iv = CryptoJS.lib.WordArray.random(16);
        
        const secKeyEncrypted = CryptoJS.AES.encrypt(secKeyBase64, key, {
          mode: CryptoJS.mode.CBC,  
          padding: CryptoJS.pad.Pkcs7,
          iv: iv // 使用生成的IV
        }).toString();
        console.log('加密后的密钥:', secKeyEncrypted);

        // 保存密钥和相关信息到本地存储
        const keyData = {
          name: keyName,
          publicKey: pubKeyBase64,
          secretKey: secKeyEncrypted,
          salt: salt.toString(), // 保存盐值以便解密
          iv: iv.toString(), // 保存生成的IV
          createdAt: new Date().toLocaleString('zh-CN')
        };

        // 获取现有的密钥列表
        let keyList = wx.getStorageSync('keyList') || [];
        keyList.push(keyData);
        wx.setStorageSync('keyList', keyList);

        // 如果当前是云端标签页，则同时上传到云端
        if (currentTab === '1' && openId) {
          wx.request({
            url: API.createKey,
            method: 'POST',
            data: {
              name: keyName,
              publicKey: pubKeyBase64,
              secretKey: secKeyEncrypted,
              openId: openId
            },
            success: (res) => {
              if (res.statusCode === 201) {
                this.loadCloudKeyList();
              }
            },
            fail: (err) => {
              console.error('上传密钥失败:', err);
              wx.showToast({
                title: '上传密钥失败',
                icon: 'none'
              });
            }
          });
        }

        // 释放内存
        instance.exports.my_free(pubKeyPtr);
        instance.exports.my_free(secKeyPtr);
        wx.showToast({
          title: '密钥生成成功',
          success: () => {
            this.loadKeyList();
          },
          icon: 'success'
        });

      })
      .then(() => {
        wx.hideLoading();
        this.setData({
          showPasswordDialog: false
        });
      })
      .catch(err => {
        console.error("操作失败:", err);
        wx.hideLoading();
        wx.showToast({
          title: '操作失败',
          icon: 'none'
        });
        this.setData({
          showPasswordDialog: false
        });
      });
  },

  loadKeyList() {
    const keyList = wx.getStorageSync('keyList') || [];

    this.setData({ keyList: keyList });
  },

  viewPublicKey(e) {
    const index = e.currentTarget.dataset.index;
    const key = this.data.keyList[index];
    wx.showModal({
      title: '公钥信息',
      content: key.publicKey,
      confirmText: '复制',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: key.publicKey,
            success: () => {
              wx.showToast({
                title: '公钥已复制',
                icon: 'success'
              });
            }
          });
        }
      }
    });
  },

  downloadKey(e) {
    const id = e.currentTarget.dataset.id;
    wx.request({
      url: API.getKeyDetail(id),
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200) {
          // 获取现有的密钥列表
          let keyList = wx.getStorageSync('keyList') || [];
          
          // 检查密钥是否已存在
          const isExist = keyList.some(key => key.publicKey === res.data.publicKey);
          if (isExist) {
            wx.showToast({
              title: '密钥已存在',
              icon: 'none'
            });
            return;
          }

          // 构建密钥数据
          const keyData = {
            name: res.data.name,
            publicKey: res.data.publicKey,
            secretKey: res.data.secretKey,
            salt: res.data.salt,
            iv: res.data.iv,
            createdAt: res.data.createdAt
          };

          // 添加到本地存储
          keyList.push(keyData);
          wx.setStorageSync('keyList', keyList);

          // 刷新本地密钥列表
          this.loadKeyList();
          wx.showToast({
            title: '下载成功',
            icon: 'success'
          });
        }
      },
      fail: (err) => {
        console.error('下载密钥失败:', err);
        wx.showToast({
          title: '下载失败',
          icon: 'none'
        });
      }
    });
  },

  deleteKey(e) {
    const index = e.currentTarget.dataset.index;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个密钥吗？此操作不可恢复。',
      success: (res) => {
        if (res.confirm) {
          let keyList = wx.getStorageSync('keyList') || [];
          keyList.splice(index, 1);
          wx.setStorageSync('keyList', keyList);
          this.loadKeyList();
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          });
        }
      }
    });
  },

  upload(e) {
    const index = e.currentTarget.dataset.index;
    const keyData = this.data.keyList[index];
    const { openId } = this.data;

    if (!openId) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '正在上传...',
    });

    wx.request({
      url: API.createKey,
      method: 'POST',
      data: {
        name: keyData.name,
        publicKey: keyData.publicKey,
        secretKey: keyData.secretKey,
        openId: openId,
        salt: keyData.salt,
        iv: keyData.iv,
        createdAt: keyData.createdAt
      },
      success: (res) => {

          wx.showToast({
            title: '上传成功',
            icon: 'success'
          });
          // 切换到云端标签页并刷新列表
          this.setData({
            currentTab: '1'
          });
          this.loadCloudKeyList();

      },
      fail: (err) => {
        console.error('上传密钥失败:', err);
        wx.showToast({
          title: '上传失败',
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  viewCloudPublicKey(e) {
    const id = e.currentTarget.dataset.id;
    wx.request({
      url: API.getKeyDetail(id),
      method: 'GET',
      
      success: (res) => {
        if (res.statusCode === 200) {
          wx.showModal({
            title: '公钥信息',
            content: res.data.publicKey,
            confirmText: '复制',
            cancelText: '关闭',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.setClipboardData({
                  data: res.data.publicKey,
                  success: () => {
                    wx.showToast({
                      title: '公钥已复制',
                      icon: 'success'
                    });
                  }
                });
              }
            }
          });
        }
      },
      fail: (err) => {
        console.error('获取密钥详情失败:', err);
        wx.showToast({
          title: '获取密钥详情失败',
          icon: 'none'
        });
      }
    });
  },

  deleteCloudKey(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个密钥吗？此操作不可恢复。',
      success: (res) => {
        if (res.confirm) {
          wx.request({
            url: API.deleteKey(id),
            method: 'DELETE',
            data: {
              openId: this.data.openId
            },
            success: (res) => {
              // if (res.statusCode === 204) {
                this.loadCloudKeyList();
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                });
              // }
            },
            fail: (err) => {
              console.error('删除密钥失败:', err);
              wx.showToast({
                title: '删除失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  },

  onPasswordInput(e) {
    this.setData({
      password: e.detail.value
    });
  },

  onKeyNameInput(e) {
    this.setData({
      keyName: e.detail.value
    });
  },

  onCloseDialog() {
    this.setData({
      showPasswordDialog: false,
      password: ''
    });
  },
  login() {
    // 先尝试从缓存获取登录状态
    const cachedOpenId = wx.getStorageSync('openId');
    if (cachedOpenId) {
      this.setData({
        openId: cachedOpenId
      });
      if (this.data.currentTab === '1') {
        this.loadCloudKeyList();
      }
      return;
    }

    wx.login({
      success: (res) => {
        if (res.code) {
          wx.request({
            url: API.login,
            method: 'POST',
            data: {
              code: res.code
            },
            success: (res) => {
              console.log("getopenid=>",res.data)
              if (res.data.openId) {
                // 保存openId到缓存
                wx.setStorageSync('openId', res.data.openId);
                this.setData({
                  openId: res.data.openId
                });
                if (this.data.currentTab === '1') {
                  this.loadCloudKeyList();
                }
              }
            },
            fail: (err) => {
              console.error('登录失败:', err);
              wx.showToast({
                title: '登录失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  },

  loadCloudKeyList() {
    if (!this.data.openId) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    wx.request({
      url: API.getKeyList(this.data.openId),
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200) {
          this.setData({
            cloudKeyList: res.data
          });
        }
      },
      fail: (err) => {
        console.error('获取云端密钥列表失败:', err);
        wx.showToast({
          title: '获取云端密钥列表失败',
          icon: 'none'
        });
      }
    });
  },
})
