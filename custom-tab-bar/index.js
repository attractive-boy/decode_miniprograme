Component({
  data: {
    value: '/pages/encode/encode',
    list: [
      { value: '/pages/encode/encode', label: '加密' },
      { value: '/pages/decode/decode', label: '解密' },
      { value: '/pages/key/key', label: '密钥' },
    ],
  },

  methods: {
    onChange(e) {
      
      wx.switchTab({
        url: e.detail.value,
      })
    },
  },
});
