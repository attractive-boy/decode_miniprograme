import gulpError from './utils/gulpError';

App({
    onShow() {
        if (gulpError !== 'gulpErrorPlaceHolder') {
            wx.redirectTo({
                url: `/pages/gulp-error/index?gulpError=${gulpError}`,
            });
        }
        global['crypto'] = {
          getRandomValues:wx.getRandomValues
        }
    },
});
