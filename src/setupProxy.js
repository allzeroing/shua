const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // 如果需要代理到其他服务，可以在这里配置
  // 目前主要用于确保HTTPS配置正确工作
  
  // 添加安全头部
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    
    // 允许不安全的本地连接（仅开发环境）
    if (process.env.NODE_ENV === 'development') {
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    
    next();
  });
}; 