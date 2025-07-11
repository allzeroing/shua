import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import './CycleTrading.css';

const CycleTrading = ({ account, provider, chainId }) => {
  const [cycleCount, setCycleCount] = useState(''); // 循环次数
  const [usdtAmountPerCycle, setUsdtAmountPerCycle] = useState(''); // 每次循环的USDT数量
  const [isCycling, setIsCycling] = useState(false); // 是否正在循环交易
  const [currentCycle, setCurrentCycle] = useState(0); // 当前循环次数
  const [cycleStatus, setCycleStatus] = useState(''); // 循环状态
  const [brBalance, setBrBalance] = useState('0'); // BR余额
  const [usdtBalance, setUsdtBalance] = useState('0'); // USDT余额

  const [cycleHistory, setCycleHistory] = useState([]); // 循环历史
  const [lastBalanceUpdate, setLastBalanceUpdate] = useState(null); // 最后余额更新时间
  const [isLoadingBalance, setIsLoadingBalance] = useState(false); // 余额加载状态
  const [debugLogs, setDebugLogs] = useState([]); // 调试日志
  const [showDebugLogs, setShowDebugLogs] = useState(false); // 是否显示调试日志
  const [errorModal, setErrorModal] = useState({ show: false, title: '', message: '', logs: [] }); // 错误弹窗
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, onCancel: null }); // 确认弹窗
  const shouldStopRef = useRef(false); // 用于控制是否停止循环
  
  // 统计信息状态
  const [totalActualUsdtReceived, setTotalActualUsdtReceived] = useState(0); // 累计实际收到的USDT总量

  // 合约地址
  const CONTRACT_ADDRESS = '0xb300000b72DEAEb607a12d5f54773D1C19c7028d';
  
  // 代币配置 - 支持多代币循环交易
  const TOKEN_CONFIGS = {
    'quq': {
      name: 'quq Token',
      symbol: 'quq',
      address: '0x4fa7C69a7B69f8Bc48233024D546bc299d6B03bf',
      poolAddress: '0x9485Ff32b6b4444C21D5abe4D9a2283d127075a2',
      decimals: 18,
      needsPriceInversion: true  // quq需要价格倒数处理
    },
    'KOGE': {
      name: 'KOGE Token', 
      symbol: 'KOGE',
      address: '0xe6DF05CE8C8301223373CF5B969AFCb1498c5528',
      poolAddress: '0xcF59B8C8BAA2dea520e3D549F97d4e49aDE17057',
      decimals: 18,
      needsPriceInversion: false  // KOGE不需要价格倒数处理
    },
    'BR': {
      name: 'BR Token',
      symbol: 'BR', 
      address: '0xff7d6a96ae471bbcd7713af9cb1feeb16cf56b41',
      poolAddress: '0x380aaDF63D84D3A434073F1d5d95f02fB23d5228',
      decimals: 18,
      needsPriceInversion: false  // BR不需要价格倒数处理
    }
  };

  // 当前选中的代币（默认为quq，后续可通过UI切换）
  const [selectedToken, setSelectedToken] = useState('quq');
  
  // 页面文案配置
  const PAGE_CONFIG = {
    description: "选择你要刷量的币种，输入每次刷多少USDT，输入需要刷几次，例如要刷15分，每次1025 USDT时，需要循环16次，会自动拉起钱包，按确定并扫脸即可完成。推荐quq，会自动返还部分手续费！",
    disclaimer: "⚠️ 免责声明：本工具为免费提供，仅供学习和研究使用。数字货币交易存在风险，我们不承担因使用本工具而造成的任何损失或后果。使用本产品即代表您已阅读并同意该免责协议。请谨慎操作，理性投资。"
  };

  // 版本信息配置 - 发布时手动更新
  const VERSION_INFO = {
    version: "v1.1.1",
    buildTime: "2025-07-11 11:15:00",
    gitHash: "main-004",
    description: "Alpha刷分工具"
  };
  
  // 基础配置
  const TOKEN_A_ADDRESS = '0x55d398326f99059ff775485246999027b3197955'; // USDT（固定）
  const TOKEN_B_ADDRESS = TOKEN_CONFIGS[selectedToken]?.address || '请填写代币地址'; // 选中的代币地址
  const POOL_ADDRESS = TOKEN_CONFIGS[selectedToken]?.poolAddress || '请填写池地址'; // 对应的池地址

  // 日志记录函数
  const addDebugLog = (message, level = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      timestamp,
      message,
      level, // 'info', 'success', 'warning', 'error'
      id: Date.now() + Math.random()
    };
    
    setDebugLogs(prev => {
      const newLogs = [...prev, logEntry];
      // 限制日志数量，最多保留100条
      if (newLogs.length > 100) {
        return newLogs.slice(-100);
      }
      return newLogs;
    });
    
    // 同时输出到控制台
    console.log(`[${timestamp}] ${message}`);
  };

  // 清空日志
  const clearDebugLogs = () => {
    setDebugLogs([]);
  };

  // 显示错误弹窗
  const showErrorModal = (title, message, includeRecentLogs = true) => {
    console.log('🚨 showErrorModal 被调用:', { title, message, includeRecentLogs });
    console.log('当前debugLogs长度:', debugLogs.length);
    
    let recentLogs = [];
    if (includeRecentLogs) {
      // 获取最近的10条日志，优先显示错误和警告
      recentLogs = debugLogs
        .slice(-20) // 获取最近20条
        .filter(log => log.level === 'error' || log.level === 'warning' || log.level === 'info')
        .slice(-10); // 只取最近10条
      console.log('筛选出的最近日志:', recentLogs);
    }
    
    const modalData = {
      show: true,
      title,
      message,
      logs: recentLogs
    };
    
    console.log('设置错误弹窗数据:', modalData);
    setErrorModal(modalData);
    
    // 同时记录到调试日志
    addDebugLog(`💥 弹窗错误: ${title} - ${message}`, 'error');
    console.log('✅ 错误弹窗应该已经显示');
  };

  // 关闭错误弹窗
  const closeErrorModal = () => {
    setErrorModal({ show: false, title: '', message: '', logs: [] });
  };

  // 显示确认弹窗
  const showConfirmModal = (title, message) => {
    return new Promise((resolve) => {
      console.log('🔔 showConfirmModal 被调用:', { title, message });
      addDebugLog(`🔔 显示确认弹窗: ${title}`, 'info');
      
      setConfirmModal({
        show: true,
        title,
        message,
        onConfirm: () => {
          console.log('✅ 用户点击确认');
          addDebugLog('✅ 用户点击确认', 'success');
          setConfirmModal({ show: false, title: '', message: '', onConfirm: null, onCancel: null });
          resolve(true);
        },
        onCancel: () => {
          console.log('❌ 用户点击取消');
          addDebugLog('❌ 用户点击取消', 'warning');
          setConfirmModal({ show: false, title: '', message: '', onConfirm: null, onCancel: null });
          resolve(false);
        }
      });
    });
  };

  // 钱包连接检查和自动重连函数
  const checkAndReconnectWallet = async () => {
    if (!window.ethereum) {
      addDebugLog('❌ MetaMask未安装', 'error');
      return false;
    }

    try {
      addDebugLog('🔍 开始检查钱包连接状态...', 'info');
      
      // 1. 检查是否有已连接的账户
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      
      if (accounts.length === 0) {
        addDebugLog('❌ 未检测到已连接的账户，尝试自动重连...', 'warning');
        return await autoReconnectWallet();
      }
      
      // 2. 检查账户是否与传入的account一致
      if (accounts[0].toLowerCase() !== account.toLowerCase()) {
        addDebugLog(`⚠️ 账户不匹配: 当前${accounts[0]} vs 传入${account}，尝试重连...`, 'warning');
        return await autoReconnectWallet();
      }
      
      // 3. 检查provider是否可用
      if (!provider) {
        addDebugLog('❌ Provider未初始化，尝试重连...', 'error');
        return await autoReconnectWallet();
      }
      
      // 4. 测试provider连接
      try {
        const network = await provider.getNetwork();
        addDebugLog(`✅ 网络连接正常: ${network.name} (${network.chainId})`, 'success');
        
        // 5. 测试基本的合约调用
        const testBalance = await provider.getBalance(account);
        addDebugLog(`✅ 账户余额查询成功: ${ethers.formatEther(testBalance)} BNB`, 'success');
        
        addDebugLog('✅ 钱包连接检查通过', 'success');
        return true;
        
      } catch (providerError) {
        addDebugLog(`❌ Provider连接测试失败: ${providerError.message}，尝试重连...`, 'error');
        return await autoReconnectWallet();
      }
      
    } catch (error) {
      addDebugLog(`❌ 钱包连接检查失败: ${error.message}，尝试重连...`, 'error');
      return await autoReconnectWallet();
    }
  };

  // 自动重新连接钱包
  const autoReconnectWallet = async () => {
    if (!window.ethereum) {
      addDebugLog('❌ MetaMask未安装，无法自动重连', 'error');
      return false;
    }

    try {
      addDebugLog('🔄 开始自动重新连接钱包...', 'info');
      
      // 1. 静默请求已连接的账户（不会弹出连接弹窗）
      const accounts = await window.ethereum.request({ 
        method: 'eth_accounts' 
      });
      
      if (accounts.length === 0) {
        addDebugLog('⚠️ 没有已连接的账户，需要用户手动连接', 'warning');
        return false;
      }
      
      addDebugLog(`✅ 找到已连接账户: ${accounts[0]}`, 'success');
      
      // 2. 等待一小段时间确保连接稳定
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 3. 再次验证连接
      const recheckAccounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (recheckAccounts.length > 0) {
        addDebugLog('✅ 钱包自动重连成功', 'success');
        return true;
      } else {
        addDebugLog('❌ 钱包自动重连后验证失败', 'error');
        return false;
      }
      
    } catch (error) {
      addDebugLog(`❌ 自动重连失败: ${error.message}`, 'error');
      return false;
    }
  };

  // 进入页面时的钱包连接检查
  useEffect(() => {
    if (account && provider) {
      addDebugLog('🔍 页面加载，开始验证钱包连接...', 'info');
      
      const validateConnection = async () => {
        // 延迟一小段时间，确保组件完全加载
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const isConnected = await checkAndReconnectWallet();
        
        if (isConnected) {
          addDebugLog('✅ 钱包连接验证通过，开始获取余额...', 'success');
          // 延迟一小段时间再获取余额，确保连接稳定
          setTimeout(() => {
            refreshAllBalances();
          }, 1000);
        } else {
          addDebugLog('⚠️ 钱包连接验证失败，请检查钱包状态', 'warning');
          addDebugLog('💡 建议：请确保MetaMask已连接并且账户正确', 'info');
        }
      };
      
      validateConnection();
    }
  }, [account, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自动获取代币余额
  useEffect(() => {
    if (account && provider) {
      console.log('钱包已连接，自动获取代币余额...');
      refreshAllBalances();
    }
  }, [account, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  // 定期刷新代币余额（每60秒）
  useEffect(() => {
    if (!account || !provider) return;
    
    const refreshInterval = setInterval(() => {
      console.log('定期刷新代币余额...');
      refreshAllBalances();
    }, 60000); // 每60秒刷新一次
    
    return () => clearInterval(refreshInterval);
  }, [account, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  // V3 查询价格：从 Pool 合约的 slot0 获取 sqrtPriceX96 计算价格
  const getAmountOutV3 = async (usdtAmountInput) => {
    if (!usdtAmountInput || !provider || parseFloat(usdtAmountInput) <= 0) {
      return '0';
    }
    
    try {
      console.log('=== 使用PancakeSwap V3 Pool slot0 查询价格 ===');
      console.log('输入USDT数量:', usdtAmountInput);
      console.log('目标池地址:', POOL_ADDRESS);
      console.log('当前代币:', TOKEN_CONFIGS[selectedToken]?.symbol || 'UNKNOWN');
      console.log('USDT地址:', TOKEN_A_ADDRESS);
      console.log('代币地址:', TOKEN_B_ADDRESS);
      
      addDebugLog(`🔍 开始查询V3价格 - 输入: ${usdtAmountInput} USDT`, 'info');
      addDebugLog(`🏊 池子信息: ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}/USDT (${POOL_ADDRESS.slice(0,8)}...)`, 'info');
      addDebugLog(`🔗 USDT: ${TOKEN_A_ADDRESS.slice(0,8)}... | ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}: ${TOKEN_B_ADDRESS.slice(0,8)}...`, 'info');
      
      const slot0Result = await provider.call({
        to: POOL_ADDRESS,
        data: '0x3850c7bd' // slot0() 方法ID
      });
      
      console.log('slot0调用结果 (原始):', slot0Result);
      addDebugLog(`📡 slot0调用结果: ${slot0Result}`, 'info');
      
      if (!slot0Result || slot0Result === '0x') {
        console.error('❌ 无法获取V3 slot0信息');
        addDebugLog('❌ slot0调用失败 - 返回空结果', 'error');
        return '0';
      }
      
      const sqrtPriceX96Hex = '0x' + slot0Result.slice(2, 66);
      const sqrtPriceX96 = ethers.getBigInt(sqrtPriceX96Hex);
      
      console.log('解析的sqrtPriceX96 (hex):', sqrtPriceX96Hex);
      console.log('解析的sqrtPriceX96 (bigint):', sqrtPriceX96.toString());
      addDebugLog(`📊 sqrtPriceX96: ${sqrtPriceX96.toString()}`, 'info');
      
      const Q96 = ethers.getBigInt('79228162514264337593543950336');
      const sqrtPriceNumber = Number(sqrtPriceX96.toString()) / Number(Q96.toString());
      const price = sqrtPriceNumber * sqrtPriceNumber;
      
      console.log('计算的sqrtPrice (number):', sqrtPriceNumber);
      console.log('计算的price (number):', price);
      addDebugLog(`💰 原始价格: ${price.toFixed(10)}`, 'info');
      
      // 获取当前代币的价格处理配置
      const needsPriceInversion = TOKEN_CONFIGS[selectedToken]?.needsPriceInversion || false;
      console.log('代币价格倒数配置:', needsPriceInversion);
      addDebugLog(`🔧 ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}价格倒数配置: ${needsPriceInversion}`, 'info');
      if (needsPriceInversion) {
        addDebugLog(`💡 ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}在池子中的排列顺序需要价格倒数处理`, 'info');
      } else {
        addDebugLog(`💡 ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}在池子中使用直接价格`, 'info');
      }
      
      let finalPrice;
      let brOutput;
      let priceCalculationMethod = '';
      const usdtAmountFloat = parseFloat(usdtAmountInput);
      
      if (needsPriceInversion) {
        // 需要倒数处理的代币（如quq）
        finalPrice = 1 / price;
        brOutput = (usdtAmountFloat * finalPrice).toString();
        priceCalculationMethod = '倒数价格计算';
        console.log('使用倒数价格计算: USDT * (1/price) =', brOutput);
        addDebugLog(`🔄 使用倒数价格: ${price.toFixed(10)} → ${finalPrice.toFixed(10)}`, 'info');
      } else {
        // 不需要倒数处理的代币（如KOGE、BR）
        finalPrice = price;
        brOutput = (usdtAmountFloat * finalPrice).toString();
        priceCalculationMethod = '直接价格计算';
        console.log('使用直接价格计算: USDT * price =', brOutput);
        addDebugLog(`➡️ 使用直接价格: ${finalPrice.toFixed(10)}`, 'info');
      }
      
      console.log('价格计算方法:', priceCalculationMethod);
      console.log('计算结果:', brOutput);
      console.log('使用的最终价格:', finalPrice.toFixed(10));
      addDebugLog(`🧮 ${priceCalculationMethod}: ${usdtAmountFloat} USDT → ${brOutput} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'success');
      addDebugLog(`📈 使用价格: ${finalPrice.toFixed(10)} (${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}/USDT)`, 'info');
      
      const brOutputFloat = parseFloat(brOutput);
      if (brOutputFloat <= 0 || brOutputFloat > 1000000000) {
        console.warn('计算结果不合理，尝试其他计算方式');
        console.warn('原始结果:', brOutput, '转换为浮点数:', brOutputFloat);
        console.warn('原始价格:', price, '使用的最终价格:', finalPrice);
        addDebugLog(`⚠️ 计算结果不合理 (${brOutputFloat})，尝试其他计算方式`, 'warning');
        
        // 尝试其他计算方式
        let alternativeOutput;
        if (needsPriceInversion) {
          // 如果之前用倒数，现在试试直接计算
          alternativeOutput = (usdtAmountFloat * price).toString();
          addDebugLog(`🔄 尝试直接价格计算: ${usdtAmountFloat} USDT * ${price.toFixed(10)} = ${alternativeOutput}`, 'warning');
        } else {
          // 如果之前用直接，现在试试倒数
          alternativeOutput = (usdtAmountFloat / price).toString();
          addDebugLog(`🔄 尝试倒数价格计算: ${usdtAmountFloat} USDT / ${price.toFixed(10)} = ${alternativeOutput}`, 'warning');
        }
        
        const alternativeFloat = parseFloat(alternativeOutput);
        if (alternativeFloat > 0 && alternativeFloat <= 1000000000) {
          brOutput = alternativeOutput;
          addDebugLog(`✅ 替代计算方式成功: ${brOutput} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'success');
        } else {
          // 最后的备用方案
          brOutput = (usdtAmountFloat * 100).toString();
          addDebugLog(`🔄 最终备用方案: ${usdtAmountFloat} USDT → ${brOutput} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'warning');
        }
      }
      
      const finalExchangeRate = parseFloat(brOutput) / usdtAmountFloat;
      console.log('最终兑换率: 1 USDT =', finalExchangeRate.toFixed(8), TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN');
      console.log('最终输出结果:', brOutput, TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN');
      addDebugLog(`✅ 最终兑换率: 1 USDT = ${finalExchangeRate.toFixed(8)} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'success');
      addDebugLog(`📋 最终输出: ${brOutput} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'success');
      
      return brOutput;
      
    } catch (error) {
      console.error('=== V3价格查询失败 ===');
      console.error('错误信息:', error.message);
      console.error('完整错误:', error);
      console.error('输入USDT数量:', usdtAmountInput);
      console.error('V3池地址:', POOL_ADDRESS);
      console.error('Provider状态:', provider ? '正常' : '空值');
      addDebugLog(`❌ V3价格查询失败: ${error.message}`, 'error');
      return '0';
    }
  };

  // V3 反向查询价格：从BR数量计算USDT数量
  const getUsdtAmountFromBr = async (brAmountInput) => {
    if (!brAmountInput || !provider || parseFloat(brAmountInput) <= 0) {
      return '0';
    }
    
    try {
      console.log('=== 使用PancakeSwap V3反向查询价格 ===');
      console.log('输入BR数量:', brAmountInput);
      console.log('目标池地址:', POOL_ADDRESS);
      console.log('当前代币:', TOKEN_CONFIGS[selectedToken]?.symbol || 'UNKNOWN');
      console.log('USDT地址:', TOKEN_A_ADDRESS);
      console.log('代币地址:', TOKEN_B_ADDRESS);
      
      addDebugLog(`🔍 开始反向查询V3价格 - 输入: ${brAmountInput} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      addDebugLog(`🏊 反向查询池子信息: ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}/USDT (${POOL_ADDRESS.slice(0,8)}...)`, 'info');
      
      const slot0Result = await provider.call({
        to: POOL_ADDRESS,
        data: '0x3850c7bd' // slot0() 方法ID
      });
      
      console.log('反向查询slot0调用结果 (原始):', slot0Result);
      addDebugLog(`📡 反向查询slot0调用结果: ${slot0Result}`, 'info');
      
      if (!slot0Result || slot0Result === '0x') {
        console.error('❌ 反向查询无法获取V3 slot0信息');
        addDebugLog('❌ 反向查询slot0调用失败 - 返回空结果', 'error');
        return '0';
      }
      
      const sqrtPriceX96Hex = '0x' + slot0Result.slice(2, 66);
      const sqrtPriceX96 = ethers.getBigInt(sqrtPriceX96Hex);
      
      console.log('反向查询解析的sqrtPriceX96 (hex):', sqrtPriceX96Hex);
      console.log('反向查询解析的sqrtPriceX96 (bigint):', sqrtPriceX96.toString());
      addDebugLog(`📊 反向查询sqrtPriceX96: ${sqrtPriceX96.toString()}`, 'info');
      
      const Q96 = ethers.getBigInt('79228162514264337593543950336');
      const sqrtPriceNumber = Number(sqrtPriceX96.toString()) / Number(Q96.toString());
      const price = sqrtPriceNumber * sqrtPriceNumber;
      
      console.log('反向查询计算的sqrtPrice (number):', sqrtPriceNumber);
      console.log('反向查询计算的price (number):', price);
      addDebugLog(`💰 反向查询原始价格: ${price.toFixed(10)}`, 'info');
      
      // 获取当前代币的价格处理配置
      const needsPriceInversion = TOKEN_CONFIGS[selectedToken]?.needsPriceInversion || false;
      console.log('反向查询代币价格倒数配置:', needsPriceInversion);
      addDebugLog(`🔧 反向查询${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}价格倒数配置: ${needsPriceInversion}`, 'info');
      if (needsPriceInversion) {
        addDebugLog(`💡 反向查询时${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}使用直接除法（因正向需要倒数）`, 'info');
      } else {
        addDebugLog(`💡 反向查询时${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}使用标准除法`, 'info');
      }
      
      const brAmountFloat = parseFloat(brAmountInput);
      let usdtOutput;
      let priceCalculationMethod = '';
      let reverseFinalPrice;
      
      if (needsPriceInversion) {
        // 需要倒数处理的代币（如quq）
        // 反向查询时：使用正向计算的倒数价格
        reverseFinalPrice = 1 / price;  // 使用倒数价格
        usdtOutput = (brAmountFloat / reverseFinalPrice).toString();
        priceCalculationMethod = '反向倒数除法计算';
        console.log('反向查询使用倒数除法: BR / (1/price) =', usdtOutput);
        addDebugLog(`🔄 反向查询用倒数价格: ${reverseFinalPrice.toFixed(10)}`, 'info');
      } else {
        // 不需要倒数处理的代币（如KOGE、BR）
        // 反向查询时：正常除法
        reverseFinalPrice = price;
        usdtOutput = (brAmountFloat / reverseFinalPrice).toString();
        priceCalculationMethod = '反向除法计算';
        console.log('反向查询使用除法计算: BR / price =', usdtOutput);
        addDebugLog(`➡️ 反向查询用直接价格: ${reverseFinalPrice.toFixed(10)}`, 'info');
      }
      
      console.log('反向查询价格计算方法:', priceCalculationMethod);
      console.log('反向查询计算结果:', usdtOutput);
      console.log('反向查询使用的最终价格:', reverseFinalPrice.toFixed(10));
      addDebugLog(`🧮 反向查询${priceCalculationMethod}: ${brAmountFloat} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'} → ${usdtOutput} USDT`, 'success');
      addDebugLog(`📈 反向查询使用价格: ${reverseFinalPrice.toFixed(10)} (原始价格)`, 'info');
      
      const usdtOutputFloat = parseFloat(usdtOutput);
      if (usdtOutputFloat <= 0 || isNaN(usdtOutputFloat)) {
        console.error('❌ 反向查询计算结果无效:', usdtOutput);
        console.error('转换为浮点数后:', usdtOutputFloat);
        addDebugLog(`❌ 反向查询计算结果无效 (${usdtOutput} → ${usdtOutputFloat})`, 'error');
        return '0';
      }
      
      const finalReverseExchangeRate = brAmountFloat / usdtOutputFloat;
      console.log('最终反向兑换率: 1 USDT =', finalReverseExchangeRate.toFixed(8), TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN');
      addDebugLog(`✅ 最终反向兑换率: 1 USDT = ${finalReverseExchangeRate.toFixed(8)} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'success');
      
      return usdtOutputFloat.toFixed(8);
      
    } catch (error) {
      console.error('=== V3反向价格查询失败 ===');
      console.error('错误信息:', error.message);
      console.error('完整错误:', error);
      console.error('输入BR数量:', brAmountInput);
      console.error('V3池地址:', POOL_ADDRESS);
      console.error('Provider状态:', provider ? '正常' : '空值');
      addDebugLog(`❌ 反向查询失败: ${error.message}`, 'error');
      return '0';
    }
  };

  // 获取BR代币余额
  const getBRBalance = async () => {
    if (!account || !provider) {
      setBrBalance('0');
      return '0';
    }
    
    try {
      console.log('=== 获取代币余额 ===');
      console.log('当前代币:', TOKEN_CONFIGS[selectedToken]?.symbol || 'UNKNOWN');
      console.log('代币地址:', TOKEN_B_ADDRESS);
      console.log('账户地址:', account);
      
      addDebugLog(`🏦 查询${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}余额`, 'info');
      
      const balanceOfData = '0x70a08231' + account.slice(2).padStart(64, '0');
      console.log('余额查询数据:', balanceOfData);
      
      const result = await provider.call({
        to: TOKEN_B_ADDRESS,
        data: balanceOfData
      });
      
      console.log('余额查询结果 (原始):', result);
      
      const balanceInEther = ethers.formatEther(result);
      console.log('余额 (格式化):', balanceInEther);
      
      setBrBalance(balanceInEther);
      addDebugLog(`✅ ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}余额: ${balanceInEther}`, 'success');
      
      return balanceInEther;
      
    } catch (error) {
      console.error('=== 获取代币余额失败 ===');
      console.error('错误信息:', error.message);
      console.error('完整错误:', error);
      console.error('账户地址:', account);
      console.error('代币地址:', TOKEN_B_ADDRESS);
      console.error('Provider状态:', provider ? '正常' : '空值');
      addDebugLog(`❌ 获取${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}余额失败: ${error.message}`, 'error');
      setBrBalance('0');
      return '0';
    }
  };

  // 获取USDT代币余额
  const getUSDTBalance = async () => {
    if (!account || !provider) {
      setUsdtBalance('0');
      return '0';
    }
    
    try {
      console.log('=== 获取USDT余额 ===');
      console.log('USDT地址:', TOKEN_A_ADDRESS);
      console.log('账户地址:', account);
      
      addDebugLog(`🏦 查询USDT余额`, 'info');
      
      const balanceOfData = '0x70a08231' + account.slice(2).padStart(64, '0');
      console.log('USDT余额查询数据:', balanceOfData);
      
      const result = await provider.call({
        to: TOKEN_A_ADDRESS,
        data: balanceOfData
      });
      
      console.log('USDT余额查询结果 (原始):', result);
      
      const balanceInEther = ethers.formatEther(result);
      console.log('USDT余额 (格式化):', balanceInEther);
      
      setUsdtBalance(balanceInEther);
      addDebugLog(`✅ USDT余额: ${balanceInEther}`, 'success');
      
      return balanceInEther;
      
    } catch (error) {
      console.error('=== 获取USDT余额失败 ===');
      console.error('错误信息:', error.message);
      console.error('完整错误:', error);
      console.error('账户地址:', account);
      console.error('USDT代币地址:', TOKEN_A_ADDRESS);
      console.error('Provider状态:', provider ? '正常' : '空值');
      addDebugLog(`❌ 获取USDT余额失败: ${error.message}`, 'error');
      setUsdtBalance('0');
      return '0';
    }
  };

  // 刷新所有代币余额
  const refreshAllBalances = async (retryCount = 0, maxRetries = 3) => {
    try {
      setIsLoadingBalance(true);
      console.log('开始刷新所有余额...');
      addDebugLog(`🔄 开始刷新所有余额 (第${retryCount + 1}次尝试)`, 'info');
      
      // 先检查网络连接
      if (provider) {
        try {
          await provider.getNetwork();
          addDebugLog('✅ 网络连接正常', 'success');
        } catch (networkError) {
          addDebugLog(`❌ 网络连接异常: ${networkError.message}`, 'error');
          throw new Error(`网络连接失败: ${networkError.message}`);
        }
      }
      
      const results = await Promise.all([getBRBalance(), getUSDTBalance()]);
      
      console.log('余额刷新完成:', {
        [TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN']: results[0],
        USDT: results[1]
      });
      
      addDebugLog(`✅ 余额刷新完成 - ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}: ${results[0]}, USDT: ${results[1]}`, 'success');
      
      setLastBalanceUpdate(new Date());
      return results;
    } catch (error) {
      console.error('=== 刷新余额失败 ===');
      console.error('错误信息:', error.message);
      console.error('完整错误:', error);
      addDebugLog(`❌ 刷新余额失败: ${error.message}`, 'error');
      
      // 如果还有重试次数，则进行重试
      if (retryCount < maxRetries) {
        const delayTime = (retryCount + 1) * 1000; // 递增延迟时间
        addDebugLog(`⏳ ${delayTime/1000}秒后进行第${retryCount + 2}次重试...`, 'warning');
        
        await new Promise(resolve => setTimeout(resolve, delayTime));
        return await refreshAllBalances(retryCount + 1, maxRetries);
      } else {
        addDebugLog(`❌ 已达到最大重试次数(${maxRetries + 1})，余额刷新失败`, 'error');
        return ['0', '0'];
      }
    } finally {
      // 只有在最后一次重试时才设置加载状态为false
      if (retryCount === 0) {
        setIsLoadingBalance(false);
      }
    }
  };

  // 将USDT数量转换为Wei格式（18位小数）
  const convertUsdtToWei = (amount) => {
    if (!amount || isNaN(amount)) return '0'.padStart(64, '0');
    // USDT通常是6位小数，但这里按照参数格式可能需要18位
    const amountInWei = ethers.parseUnits(amount.toString(), 18);
    return amountInWei.toString(16).padStart(64, '0'); // 转换为64位十六进制
  };

  // 将BR数量转换为Wei格式（18位小数）
  const convertBrToWei = (amount) => {
    if (!amount || isNaN(amount)) return '0'.padStart(64, '0');
    // BR代币也使用18位小数
    const amountInWei = ethers.parseUnits(amount.toString(), 18);
    return amountInWei.toString(16).padStart(64, '0'); // 转换为64位十六进制
  };

  // 构建交易数据 (复用 FixedTrade 的逻辑)
  const buildTransactionData = (isUsdtToBr = true, usdtAmount, brAmount) => {
    // 获取代币地址（去掉0x前缀）
    const tokenAAddr = TOKEN_A_ADDRESS.slice(2).toLowerCase(); // USDT地址（去掉0x）
    const tokenBAddr = TOKEN_B_ADDRESS.slice(2).toLowerCase(); // 选中代币地址（去掉0x）
    
    // 构建代币地址参数
    const tokenAParam = '000000000000000000000000' + tokenAAddr; // 32字节对齐的USDT地址
    const tokenBParam = '000000000000000000000000' + tokenBAddr; // 32字节对齐的选中代币地址
    
    // 分割代币地址参数用于参数拼接（基于32字节对齐后的地址参数按照28+4字节分割）
    const tokenAPart1 = tokenAParam.slice(0, 56); // USDT地址参数的前56字符（前28字节）
    const tokenAPart2 = tokenAParam.slice(56); // USDT地址参数的后8字符（后4字节）
    const tokenBPart1 = tokenBParam.slice(0, 56); // 选中代币地址参数的前56字符（前28字节）
    const tokenBPart2 = tokenBParam.slice(56); // 选中代币地址参数的后8字符（后4字节）
    
    // 计算时间戳：当前时间 + 2分钟（120秒），使用毫秒时间戳
    const currentTime = Date.now(); // 当前毫秒时间戳
    const deadline = currentTime + (120 * 1000); // 加2分钟（120000毫秒）
    const deadlineHex = deadline.toString(16).padStart(64, '0'); // 转换为64位十六进制
    
    // 分割时间戳：前28字节 + 后4字节
    const timestampPart1 = deadlineHex.slice(0, 56);  // 前28字节（56个十六进制字符）用于参数11后28字节
    const timestampPart2 = deadlineHex.slice(56, 64); // 后4字节（8个十六进制字符）用于参数12前4字节
    
    // 处理USDT数量
    const usdtAmountHex = convertUsdtToWei(usdtAmount || '0');
    const usdtPart1 = usdtAmountHex.slice(0, 56); // 前28字节（56个十六进制字符）用于参数16
    const usdtPart2 = usdtAmountHex.slice(56, 64); // 后4字节（8个十六进制字符）用于参数17
    
    // 处理BR数量
    const brAmountHex = convertBrToWei(brAmount || '0');
    const brPart1 = brAmountHex.slice(0, 56); // 前28字节（56个十六进制字符）用于参数10后28字节
    const brPart2 = brAmountHex.slice(56, 64); // 后4字节（8个十六进制字符）用于参数11前4字节
    
    console.log('=== 循环交易数据构建 ===');
    console.log('代币A地址(USDT):', TOKEN_A_ADDRESS);
    console.log('代币B地址(选中代币):', TOKEN_B_ADDRESS);
    console.log('池地址:', POOL_ADDRESS);
    console.log('=== 代币地址分割 ===');
    console.log('tokenAAddr (原始地址):', tokenAAddr);
    console.log('tokenBAddr (原始地址):', tokenBAddr);
    console.log('tokenAParam (32字节对齐):', tokenAParam);
    console.log('tokenBParam (32字节对齐):', tokenBParam);
    console.log('tokenAPart1 (前56字符/28字节):', tokenAPart1);
    console.log('tokenAPart2 (后8字符/4字节):', tokenAPart2);
    console.log('tokenBPart1 (前56字符/28字节):', tokenBPart1);
    console.log('tokenBPart2 (后8字符/4字节):', tokenBPart2);
    console.log('当前毫秒时间戳:', currentTime);
    console.log('截止毫秒时间戳:', deadline);
    console.log('截止时间十六进制:', deadlineHex);
    console.log('时间戳第一部分(参数11后28字节):', timestampPart1);
    console.log('时间戳第二部分(参数12前4字节):', timestampPart2);
    console.log('USDT数量:', usdtAmount);
    console.log('USDT数量十六进制:', usdtAmountHex);
    console.log('USDT第一部分(参数16后28字节):', usdtPart1);
    console.log('USDT第二部分(参数17前4字节):', usdtPart2);
    console.log('选中代币数量:', brAmount);
    console.log('选中代币数量十六进制:', brAmountHex);
    console.log('选中代币完整数量(参数4):', brAmountHex);
    console.log('选中代币第一部分(参数10后28字节):', brPart1);
    console.log('选中代币第二部分(参数11前4字节):', brPart2);
    
    // 动态获取当前选中代币的池子地址
    const poolAddr = POOL_ADDRESS.slice(2).toLowerCase(); // 去掉0x前缀
    const poolParam = poolAddr; // 32字节对齐的池子地址
    const poolPart1 = poolParam.slice(0, 32); // 池子地址的前16字节
    const poolPart2 = poolParam.slice(32); // 池子地址的后4字节
    
    console.log('=== 池子地址处理 ===');
    console.log('原始池子地址:', POOL_ADDRESS);
    console.log('池子地址(去0x):', poolAddr);
    console.log('池子地址32字节对齐:', poolParam);
    console.log('池子地址前28字节:', poolPart1);
    console.log('池子地址后4字节:', poolPart2);
    
    // 您提供的完整交易数据
    const methodId = '0xe5e8894b';
    
    let params;
    
    if (isUsdtToBr) {
      // USDT -> BR 交易参数
      params = [
        '0000000000000000000000005efc784d444126ecc05f22c49ff3fbd7d9f4868a', // 参数0
        tokenAParam, // 参数1: USDT地址
        usdtAmountHex, // 参数2: USDT数量
        tokenBParam, // 参数3: 选中代币地址
        brAmountHex, // 参数4: 选中代币数量
        '00000000000000000000000000000000000000000000000000000000000000c0', // 参数5
        '0000000000000000000000000000000000000000000000000000000000000404', // 参数6
        '9aa9035600000000000000000000000000000000000000000000000000000000', // 参数7
        '00000000' + tokenAPart1, // 参数8: 前4字节固定，USDT地址的前28字节
        tokenAPart2 + tokenBPart1, // 参数9: USDT地址后4字节 + 选中代币地址前28字节
        tokenBPart2 + brPart1, // 参数10: 选中代币地址后4字节 + 选中代币数量的前28字节
        brPart2 + timestampPart1, // 参数11: 选中代币数量的后4字节 + 时间戳的前28字节
        timestampPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数12: 时间戳的后4字节 + 后28字节固定
        '0000010000000000000000000000000000000000000000000000000000000000', // 参数13
        '0000014000000000000000000000000000000000000000000000000000000000', // 参数14
        '0000000000000000000000000000000000000000000000000000000000000000', // 参数15
        '00000001' + usdtPart1, // 参数16: 前4字节固定 + USDT数量的前28字节
        usdtPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数17: USDT数量的后4字节 + 后28字节固定
        '0000000100000000000000000000000000000000000000000000000000000000', // 参数18
        '0000002000000000000000000000000000000000000000000000000000000000', // 参数19
        '0000000100000000000000000000000000000000000000000000000000000000', // 参数20
        '0000002000000000000000000000000000000000000000000000000000000000', // 参数21
        '000000a000000000000000000000000000000000000000000000000000000000', // 参数22
        '000000e000000000000000000000000000000000000000000000000000000000', // 参数23
        '0000012000000000000000000000000000000000000000000000000000000000', // 参数24
        '00000160' + tokenAPart1, // 参数25: 固定前缀 + USDT地址的前28字节
        tokenAPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数26: USDT地址的后4字节 + 固定后缀
        '0000000102000000000000000000000000000000000000000000000000000000', // 参数27
        '0000000000000000000000000000000000000000000000000000000000000000', // 参数28
        '000000010000000000000000000000005efc784d444126ecc05f22c49ff3fbd7', // 参数29
        'd9f4868a00000000000000000000000000000000000000000000000000000000', // 参数30
        '00000001000000000000000000002710' + poolPart1, // 参数31: 固定前缀 + 当前池子地址前16字节
        poolPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数32: 当前池子地址后4字节 + 固定后缀
        '0000000100000000000000000000000000000000000000000000000000000000', // 参数33
        '0000002000000000000000000000000000000000000000000000000000000000', // 参数34
        '0000008000000000000000000000000000000000000000000000000000000000', // 参数35
        '00000000' + tokenAPart1, // 参数36: 固定前缀 + USDT地址的前28字节
        tokenAPart2 + tokenBPart1, // 参数37: USDT地址的后4字节 + 选中代币地址的前28字节
        tokenBPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数38: 选中代币地址后4字节 + 固定后缀
        '0000006400000000000000000000000000000000000000000000000000000000'  // 参数39
      ];
    } else {
      // BR -> USDT 交易参数（代币方向相反）
      params = [
        '0000000000000000000000005efc784d444126ecc05f22c49ff3fbd7d9f4868a', // 参数0
        tokenBParam, // 参数1: 选中代币地址
        brAmountHex, // 参数2: 选中代币数量
        tokenAParam, // 参数3: USDT地址
        usdtAmountHex, // 参数4: USDT数量
        '00000000000000000000000000000000000000000000000000000000000000c0', // 参数5
        '0000000000000000000000000000000000000000000000000000000000000404', // 参数6
        '9aa9035600000000000000000000000000000000000000000000000000000000', // 参数7
        '00000000' + tokenBPart1, // 参数8: 选中代币地址前28字节
        tokenBPart2 + tokenAPart1, // 参数9: 选中代币地址后4字节 + USDT地址前28字节
        tokenAPart2 + usdtPart1, // 参数10: USDT地址后4字节 + USDT数量的前28字节
        usdtPart2 + timestampPart1, // 参数11: USDT数量后4字节 + 时间戳的前28字节
        timestampPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数12: 时间戳的后4字节 + 后28字节固定
        '0000010000000000000000000000000000000000000000000000000000000000', // 参数13
        '0000014000000000000000000000000000000000000000000000000000000000', // 参数14
        '0000000000000000000000000000000000000000000000000000000000000000', // 参数15
        '00000001' + brPart1, // 参数16: 前4字节固定 + 后28字节BR数量
        brPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数17: 前4字节BR数量 + 后28字节固定
        '0000000100000000000000000000000000000000000000000000000000000000', // 参数18
        '0000002000000000000000000000000000000000000000000000000000000000', // 参数19
        '0000000100000000000000000000000000000000000000000000000000000000', // 参数20
        '0000002000000000000000000000000000000000000000000000000000000000', // 参数21
        '000000a000000000000000000000000000000000000000000000000000000000', // 参数22
        '000000e000000000000000000000000000000000000000000000000000000000', // 参数23
        '0000012000000000000000000000000000000000000000000000000000000000', // 参数24
        '00000160' + tokenBPart1, // 参数25: 固定前缀 + 选中代币地址前28字节
        tokenBPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数26: 选中代币地址后4字节 + 固定后缀
        '0000000102000000000000000000000000000000000000000000000000000000', // 参数27
        '0000000000000000000000000000000000000000000000000000000000000000', // 参数28
        '000000010000000000000000000000005efc784d444126ecc05f22c49ff3fbd7', // 参数29
        'd9f4868a00000000000000000000000000000000000000000000000000000000', // 参数30
        '00000001000000000000000000002710' + poolPart1, // 参数31: 固定16字节前缀 + 当前池子地址前16字节
        poolPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数32: 当前池子地址后4字节 + 固定后缀
        '0000000100000000000000000000000000000000000000000000000000000000', // 参数33
        '0000002000000000000000000000000000000000000000000000000000000000', // 参数34
        '0000008000000000000000000000000000000000000000000000000000000000', // 参数35
        '00000000' + tokenBPart1, // 参数36: 固定前缀 + 选中代币地址
        tokenBPart2 + tokenAPart1, // 参数37: 选中代币地址后4字节 + USDT地址前16字节
        tokenAPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数38: USDT地址后4字节 + 固定后缀
        '0000006400000000000000000000000000000000000000000000000000000000'  // 参数39
      ];
    }
    
    console.log('=== 循环交易类型 ===');
    console.log('交易方向:', isUsdtToBr ? 'USDT -> 选中代币' : '选中代币 -> USDT');
    console.log('使用的参数数组:', isUsdtToBr ? 'USDT->选中代币参数' : '选中代币->USDT参数');

    // 打印完整的参数数组
    console.log('=== 完整参数数组 ===');
    params.forEach((param, index) => {
      console.log(`参数${index}: ${param}`);
    });
    console.log('参数总数:', params.length);
    console.log('MethodID:', methodId);
    
    // 拼接完整的交易数据
    const fullData = methodId + params.join('');
    console.log('完整交易数据:', fullData);
    console.log('交易数据总长度:', fullData.length);
    console.log('是否以0x开头:', fullData.startsWith('0x'));
    
    // 验证交易数据格式
    console.log('=== 交易数据验证 ===');
    console.log('MethodID:', methodId);
    console.log('MethodID长度:', methodId.length);
    console.log('参数数据长度:', params.join('').length);
    console.log('预期总长度:', methodId.length + params.join('').length);
    
    // 检查每个参数是否为64字符（32字节）
    params.forEach((param, index) => {
      if (param.length !== 64) {
        console.error(`❌ 参数${index}长度错误: ${param.length}, 应该是64字符`);
        console.error(`参数${index}内容: ${param}`);
      }
    });
    
    return fullData;
  };

  // 执行单笔交易
  const executeTransaction = async (isUsdtToBr = true, usdtAmount, brAmount) => {
    if (!account || !provider) {
      throw new Error('请先连接钱包');
    }

    try {
      const signer = await provider.getSigner();
      const data = buildTransactionData(isUsdtToBr, usdtAmount, brAmount);

      console.log('执行交易:', {
        type: isUsdtToBr ? 'USDT->BR' : 'BR->USDT',
        usdtAmount,
        brAmount,
        contract: CONTRACT_ADDRESS
      });

      // 估算Gas
      let gasEstimate;
      const gasEstimateParams = {
        to: CONTRACT_ADDRESS,
        data: data,
        from: account,
        value: '0x0'
      };
      
      try {
        console.log('开始Gas估算...');
        console.log('Gas估算参数:', gasEstimateParams);
        console.log('交易类型:', isUsdtToBr ? 'USDT->BR' : 'BR->USDT');
        console.log('当前账户:', account);
        console.log('当前BR余额:', brBalance);
        console.log('当前USDT余额:', usdtBalance);
        
        gasEstimate = await provider.estimateGas(gasEstimateParams);
        console.log('Gas估算成功:', gasEstimate.toString());
      } catch (gasError) {
        console.error('=== Gas估算失败 ===');
        console.error('错误类型:', gasError.name);
        console.error('错误信息:', gasError.message);
        console.error('错误代码:', gasError.code);
        console.error('错误数据:', gasError.data);
        console.error('完整错误对象:', gasError);
        
        // 详细参数输出
        console.error('失败的交易参数:');
        console.error('- 合约地址:', CONTRACT_ADDRESS);
        console.error('- 交易数据长度:', data.length);
        console.error('- 交易数据:', data);
        console.error('- 发送账户:', account);
        console.error('- 交易金额:', '0x0');
        
        // 当前状态输出
        console.error('当前状态:');
        console.error('- 链ID:', chainId);
        console.error('- BR余额:', brBalance);
        console.error('- USDT余额:', usdtBalance);
        console.error('- 交易方向:', isUsdtToBr ? 'USDT购买BR' : 'BR卖出USDT');
        console.error('- USDT数量:', usdtAmount);
        console.error('- BR数量:', brAmount);
        
        // 尝试解析具体错误原因
        if (gasError.message.includes('insufficient funds')) {
          console.error('可能原因: 余额不足');
        } else if (gasError.message.includes('execution reverted')) {
          console.error('可能原因: 交易会失败（滑点过大、余额不足等）');
        } else if (gasError.message.includes('gas required exceeds allowance')) {
          console.error('可能原因: Gas限制过低');
        } else if (gasError.message.includes('nonce')) {
          console.error('可能原因: Nonce问题');
        } else {
          console.error('未知错误，建议检查网络连接和合约状态');
        }
        
        console.log('使用固定Gas Limit: 330000');
        gasEstimate = 330000;
      }

      // 构建交易对象
      const transaction = {
        to: CONTRACT_ADDRESS,
        data: data,
        gasLimit: gasEstimate,
        value: '0x0',
      };

      // 获取Gas价格
      console.log('获取Gas价格...');
      const gasPrice = await provider.getFeeData();
      console.log('Gas价格信息:', gasPrice);
      
      if (gasPrice && gasPrice.maxFeePerGas) {
        transaction.maxFeePerGas = gasPrice.maxFeePerGas;
        transaction.maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas;
        transaction.type = 2;
        console.log('使用EIP-1559交易类型');
      } else if (gasPrice && gasPrice.gasPrice) {
        transaction.gasPrice = gasPrice.gasPrice;
        transaction.type = 0;
        console.log('使用传统交易类型');
      }

      console.log('完整交易对象:', transaction);

      // 发送交易
      console.log('💼 即将调用钱包签名交易...');
      console.log('🔔 钱包应该会弹出签名窗口，请用户确认交易');
      
      const txResponse = await signer.sendTransaction(transaction);
      
      console.log('✅ 钱包签名完成，交易已发送到区块链');
      console.log('交易Hash:', txResponse.hash);
      console.log('交易响应:', txResponse);
      
      // 等待交易确认
      console.log('等待交易确认...');
      const receipt = await txResponse.wait();
      console.log('交易已确认:', receipt);
      console.log('交易状态:', receipt.status === 1 ? '成功' : '失败');
      
      // 安全检查gas相关信息
      console.log('Receipt对象结构:', {
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
        gasPrice: receipt.gasPrice,
        type: receipt.type,
        status: receipt.status
      });
      
      console.log('Gas使用量:', receipt.gasUsed ? receipt.gasUsed.toString() : '未知');
      console.log('有效Gas价格:', receipt.effectiveGasPrice ? receipt.effectiveGasPrice.toString() : '未知');
      
      // 如果effectiveGasPrice为空，尝试从其他字段获取
      if (!receipt.effectiveGasPrice && receipt.gasPrice) {
        console.log('备用Gas价格:', receipt.gasPrice.toString());
      }
      
      return receipt;
      
    } catch (error) {
      console.error('=== 交易执行失败 ===');
      console.error('错误类型:', error.name);
      console.error('错误信息:', error.message);
      console.error('错误代码:', error.code);
      console.error('错误数据:', error.data);
      console.error('完整错误对象:', error);
      
      // 分析具体错误原因
      if (isUserRejectedError(error)) {
        console.error('🚫 用户拒绝了交易签名');
        // 抛出标准化的用户拒绝错误
        const userRejectedError = new Error('用户拒绝签名');
        userRejectedError.code = 4001;
        userRejectedError.originalError = error;
        throw userRejectedError;
      } else if (error.message.includes('insufficient funds')) {
        console.error('余额不足');
      } else if (error.message.includes('gas required exceeds allowance')) {
        console.error('Gas限制不足');
      } else if (error.message.includes('transaction underpriced')) {
        console.error('Gas价格过低');
      } else if (error.message.includes('nonce too low')) {
        console.error('Nonce过低');
      } else if (error.message.includes('replacement transaction underpriced')) {
        console.error('替换交易Gas价格过低');
      } else if (error.message.includes('execution reverted')) {
        console.error('交易被回滚（可能是滑点过大或余额不足）');
      } else if (error.message.includes('network')) {
        console.error('网络连接问题');
      } else {
        console.error('其他未知错误');
      }
      
      throw error;
    }
  };

  // 检测用户拒绝签名的错误
  const isUserRejectedError = (error) => {
    if (!error) return false;
    
    // 检查错误代码
    if (error.code === 4001) return true;
    
    // 检查错误消息
    const errorMessage = error.message?.toLowerCase() || '';
    const userRejectedKeywords = [
      'user rejected',
      'user denied',
      'user cancelled',
      'user canceled',
      'transaction was rejected',
      'transaction rejected',
      'user rejected transaction',
      'user denied transaction request',
      'metamask tx signature',
      'reject',
      'denied'
    ];
    
    return userRejectedKeywords.some(keyword => errorMessage.includes(keyword));
  };

  // 等待并重试余额检查
  const waitForBalanceUpdate = async (checkFunction, expectedMinimum, description, maxRetries = 15, retryDelay = 3000) => {
    setCycleStatus(`等待${description}更新...`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // 检查是否被用户停止
      if (shouldStopRef.current) {
        console.log(`🛑 ${description}等待被用户停止`);
        throw new Error(`用户停止：${description}等待被中断`);
      }
      
      try {
        const balance = await checkFunction();
        const balanceFloat = parseFloat(balance);
        
        console.log(`${description}检查第${attempt}次: ${balanceFloat}, 期望最小值: ${expectedMinimum}`);
        
        if (balanceFloat >= expectedMinimum) {
          console.log(`✅ ${description}已更新: ${balanceFloat}`);
          setCycleStatus(`${description}已更新: ${balanceFloat.toFixed(6)}`);
          return balance;
        }
        
        if (attempt < maxRetries) {
          setCycleStatus(`等待${description}更新... (${attempt}/${maxRetries}) 当前: ${balanceFloat.toFixed(6)}`);
          // 渐进式延迟：前几次较短，后面较长
          const delay = attempt <= 3 ? 2000 : attempt <= 6 ? 3000 : 4000;
          
          // 分段等待，每500ms检查一次停止状态
          const checkInterval = 500;
          const totalWait = delay;
          for (let waited = 0; waited < totalWait; waited += checkInterval) {
            if (shouldStopRef.current) {
              console.log(`🛑 ${description}等待期间被用户停止`);
              throw new Error(`用户停止：${description}等待被中断`);
            }
            await new Promise(resolve => setTimeout(resolve, Math.min(checkInterval, totalWait - waited)));
          }
        }
      } catch (error) {
        console.error(`${description}检查第${attempt}次失败:`, error);
        if (error.message.includes('用户停止')) {
          throw error; // 重新抛出用户停止的错误
        }
        if (attempt < maxRetries) {
          // 同样在错误等待时检查停止状态
          const checkInterval = 500;
          for (let waited = 0; waited < retryDelay; waited += checkInterval) {
            if (shouldStopRef.current) {
              console.log(`🛑 ${description}错误等待期间被用户停止`);
              throw new Error(`用户停止：${description}等待被中断`);
            }
            await new Promise(resolve => setTimeout(resolve, Math.min(checkInterval, retryDelay - waited)));
          }
        }
      }
    }
    
    throw new Error(`${description}等待超时，已重试${maxRetries}次，最后检查值可能仍未达到预期`);
  };

  // 单次循环交易
  const performSingleCycle = async (cycleIndex) => {
    try {
      // 检查是否被用户停止
      if (shouldStopRef.current) {
        throw new Error('用户停止：循环被中断');
      }
      
      setCycleStatus(`第 ${cycleIndex} 次循环：刷新余额...`);
      
      // 刷新余额并记录购买前的BR余额
      const balanceResults = await refreshAllBalances();
      const brBalanceBeforeBuy = parseFloat(balanceResults[0]); // 直接使用refreshAllBalances的返回值，确保是最新的
      
      addDebugLog(`📊 第 ${cycleIndex} 次循环购买前余额确认: ${brBalanceBeforeBuy} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      
      // 检查是否被用户停止
      if (shouldStopRef.current) {
        throw new Error('用户停止：循环被中断');
      }
      
      // 第一步：用USDT购买BR
      setCycleStatus(`第 ${cycleIndex} 次循环：计算购买BR数量...`);
      addDebugLog(`📊 第 ${cycleIndex} 次循环开始价格查询`, 'info');
      addDebugLog(`输入USDT数量: ${usdtAmountPerCycle} USDT`, 'info');
      addDebugLog(`目标代币: ${TOKEN_CONFIGS[selectedToken]?.symbol || 'UNKNOWN'}`, 'info');
      
      const expectedBRAmount = await getAmountOutV3(usdtAmountPerCycle);
      
      addDebugLog(`V3价格查询结果: ${expectedBRAmount} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'success');
      
      if (parseFloat(expectedBRAmount) <= 0) {
        addDebugLog(`❌ 价格查询结果无效: ${expectedBRAmount}`, 'error');
        throw new Error('无法获取BR价格');
      }
      
      // 检查是否被用户停止
      if (shouldStopRef.current) {
        throw new Error('用户停止：循环被中断');
      }
      
      const minBRAmount = (parseFloat(expectedBRAmount) * 0.99985).toFixed(8);
      
      addDebugLog(`🔔 准备发起第 ${cycleIndex} 次循环的购买${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}交易，即将拉起钱包...`, 'info');
      addDebugLog(`购买前${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}余额: ${brBalanceBeforeBuy} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      setCycleStatus(`第 ${cycleIndex} 次循环：准备购买BR，等待钱包签名...`);
      
      const buyReceipt = await executeTransaction(true, usdtAmountPerCycle, minBRAmount);
      
      addDebugLog(`✅ 第 ${cycleIndex} 次循环的购买${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}交易已完成，交易hash: ${buyReceipt.transactionHash}`, 'success');
      
      // 等待BR余额更新
      const minimumBrExpected = brBalanceBeforeBuy + parseFloat(minBRAmount); // 购买前余额 + 预期最小值
      
      addDebugLog(`📊 第 ${cycleIndex} 次循环余额更新等待参数:`, 'info');
      addDebugLog(`  购买前余额: ${brBalanceBeforeBuy} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      addDebugLog(`  最低期望购买: ${parseFloat(minBRAmount)} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      addDebugLog(`  80%安全值: ${parseFloat(minBRAmount) * 0.8} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      addDebugLog(`  最低期望总余额: ${minimumBrExpected} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      
      setCycleStatus(`第 ${cycleIndex} 次循环：等待BR余额更新...`);
      const currentBrBalance = await waitForBalanceUpdate(
        getBRBalance,
        minimumBrExpected,
        `${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}余额`
      );
      
      // 计算实际购买到的BR数量
      const actualBrBought = parseFloat(currentBrBalance) - brBalanceBeforeBuy;
      addDebugLog(`📊 第 ${cycleIndex} 次循环购买${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}统计:`, 'info');
      addDebugLog(`  购买前余额: ${brBalanceBeforeBuy} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      addDebugLog(`  购买后余额: ${parseFloat(currentBrBalance)} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      addDebugLog(`  实际购买: ${actualBrBought} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      addDebugLog(`  预期购买: ${parseFloat(expectedBRAmount)} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      
      // 检查是否被用户停止
      if (shouldStopRef.current) {
        throw new Error('用户停止：循环被中断');
      }
      
      // 验证是否购买到了足够的BR
      if (actualBrBought <= 0) {
        addDebugLog(`❌ 购买${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}失败，实际购买数量: ${actualBrBought}`, 'error');
        showErrorModal(
          `购买${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}失败`,
          `第 ${cycleIndex} 次循环购买${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}失败：\n\n实际购买数量: ${actualBrBought} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}\n预期购买数量: ${parseFloat(expectedBRAmount)} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}\n\n可能原因：\n1. 交易滑点过大\n2. 流动性不足\n3. 网络拥堵导致交易失败\n\n建议：减少交易数量或稍后重试`,
          true
        );
        throw new Error(`购买${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}失败，实际购买数量: ${actualBrBought}`);
      }
      
      setCycleStatus(`第 ${cycleIndex} 次循环：计算卖出USDT数量...`);
      // 重要：只计算实际购买到的BR数量能换回多少USDT，而不是使用总余额
      addDebugLog(`📊 第 ${cycleIndex} 次循环开始反向价格查询`, 'info');
      addDebugLog(`输入${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}数量: ${actualBrBought.toFixed(8)}`, 'info');
      
      const expectedUSDTAmount = await getUsdtAmountFromBr(actualBrBought.toFixed(8));
      
      addDebugLog(`反向V3价格查询结果: ${expectedUSDTAmount} USDT`, 'success');
      
      const minUSDTAmount = (parseFloat(expectedUSDTAmount) * 0.99985).toFixed(8);
      
      // 检查是否被用户停止
      if (shouldStopRef.current) {
        throw new Error('用户停止：循环被中断');
      }
      
      // 记录卖出前的USDT余额
      const usdtBalanceBeforeSell = await getUSDTBalance();
      
      setCycleStatus(`第 ${cycleIndex} 次循环：卖出BR...`);
      addDebugLog(`📊 第 ${cycleIndex} 次循环卖出参数:`, 'info');
      addDebugLog(`  卖出${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}数量: ${actualBrBought.toFixed(8)} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      addDebugLog(`  总${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}余额: ${currentBrBalance} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'info');
      addDebugLog(`  预期USDT输出: ${expectedUSDTAmount} USDT`, 'info');
      addDebugLog(`  最低USDT输出: ${minUSDTAmount} USDT`, 'info');
      addDebugLog(`  卖出前USDT余额: ${usdtBalanceBeforeSell} USDT`, 'info');
      
      addDebugLog(`🔔 准备发起第 ${cycleIndex} 次循环的卖${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}交易，即将拉起钱包...`, 'info');
      addDebugLog(`🔥 重要：只卖出本次购买的 ${actualBrBought.toFixed(8)} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}，保留用户原有的${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`, 'warning');
      setCycleStatus(`第 ${cycleIndex} 次循环：准备卖出BR，等待钱包签名...`);
      
      // executeTransaction(isUsdtToBr, usdtAmount, brAmount)
      // BR->USDT: usdtAmount=期望输出, brAmount=输入数量
      // 重要修改：使用 actualBrBought 而不是 currentBrBalance
      const sellReceipt = await executeTransaction(false, minUSDTAmount, actualBrBought.toFixed(8));
      
      addDebugLog(`✅ 第 ${cycleIndex} 次循环的卖${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}交易已完成，交易hash: ${sellReceipt.transactionHash}`, 'success');
      
      // 等待USDT余额更新
      const expectedUsdtBalanceAfterSell = parseFloat(usdtBalanceBeforeSell) + parseFloat(minUSDTAmount) * 0.8; // 预期的80%作为最小值
      setCycleStatus(`第 ${cycleIndex} 次循环：等待USDT余额更新...`);
      const currentUsdtBalance = await waitForBalanceUpdate(
        getUSDTBalance,
        expectedUsdtBalanceAfterSell,
        'USDT余额'
      );
      
      // 计算实际收到的USDT数量
      const actualUsdtReceived = parseFloat(currentUsdtBalance) - parseFloat(usdtBalanceBeforeSell);
      
      addDebugLog(`📊 第 ${cycleIndex} 次循环卖出${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}统计:`, 'info');
      addDebugLog(`  卖出前USDT余额: ${usdtBalanceBeforeSell} USDT`, 'info');
      addDebugLog(`  卖出后USDT余额: ${parseFloat(currentUsdtBalance)} USDT`, 'info');
      addDebugLog(`  实际收到: ${actualUsdtReceived} USDT`, 'info');
      addDebugLog(`  预期收到: ${parseFloat(expectedUSDTAmount)} USDT`, 'info');
      
      // 计算本次循环的USDT消耗和回收
      const usdtSpent = parseFloat(usdtAmountPerCycle);
      const usdtReceived = actualUsdtReceived; // 使用实际收到的USDT数量
      const usdtDifference = usdtReceived - usdtSpent;
      
      // 记录历史
      const cycleRecord = {
        cycle: cycleIndex,
        usdtSpent: usdtSpent.toFixed(6),
        usdtReceived: usdtReceived.toFixed(6),
        usdtDifference: usdtDifference.toFixed(6),
        brBought: actualBrBought.toFixed(8), // 使用实际购买的BR数量
        brSold: actualBrBought.toFixed(8),   // 使用实际卖出的BR数量（与购买数量相同）
        buyTx: buyReceipt.transactionHash,
        sellTx: sellReceipt.transactionHash,
        timestamp: new Date(),
        // 添加详细的统计信息
        expectedUsdtReceived: parseFloat(expectedUSDTAmount).toFixed(6), // 预期收到的USDT
        actualUsdtReceived: actualUsdtReceived.toFixed(6), // 实际收到的USDT
        usdtBalanceBeforeSell: parseFloat(usdtBalanceBeforeSell).toFixed(6), // 卖出前USDT余额
        usdtBalanceAfterSell: parseFloat(currentUsdtBalance).toFixed(6), // 卖出后USDT余额
        slippage: ((actualUsdtReceived - parseFloat(expectedUSDTAmount)) / parseFloat(expectedUSDTAmount) * 100).toFixed(4) // 滑点百分比
      };
      
      setCycleHistory(prev => [...prev, cycleRecord]);
      
      // 更新累计实际收到的USDT总量
      setTotalActualUsdtReceived(prev => prev + actualUsdtReceived);
      
      addDebugLog(`📊 第 ${cycleIndex} 次循环完成汇总:`, 'success');
      addDebugLog(`  本次消耗: ${usdtSpent.toFixed(6)} USDT`, 'info');
      addDebugLog(`  本次实际收到: ${actualUsdtReceived.toFixed(6)} USDT`, 'info');
      addDebugLog(`  本次净差额: ${usdtDifference.toFixed(6)} USDT`, usdtDifference >= 0 ? 'success' : 'warning');
      addDebugLog(`  滑点: ${cycleRecord.slippage}%`, 'info');
      
      // 刷新余额显示
      await refreshAllBalances();
      
      return cycleRecord;
      
    } catch (error) {
      addDebugLog(`❌ 第 ${cycleIndex} 次循环失败: ${error.message}`, 'error');
      console.error(`第 ${cycleIndex} 次循环失败:`, error);
      
      // 如果是关键错误，显示弹窗
      if (!isUserRejectedError(error) && !error.message.includes('用户停止')) {
        showErrorModal(
          `第 ${cycleIndex} 次循环失败`,
          `错误详情：${error.message}\n\n建议：请检查网络连接、Gas费用设置或代币余额是否充足`,
          true
        );
      }
      
      throw error;
    }
  };

  // 开始循环交易
  const startCycleTrading = async () => {
    // 添加调试日志 - 函数开始
    console.log('🚀 startCycleTrading 函数开始执行');
    addDebugLog('🚀 用户点击开始循环交易按钮', 'info');
    
    // 调试：检查钱包连接状态
    console.log('钱包连接状态检查:', { account, provider: !!provider });
    addDebugLog(`钱包连接状态: account=${account}, provider=${!!provider}`, 'info');
    
    if (!account || !provider) {
      console.log('❌ 钱包未连接，显示错误弹窗');
      addDebugLog('❌ 钱包未连接，显示错误弹窗', 'error');
      showErrorModal(
        '钱包未连接',
        '请先连接钱包后再进行循环交易：\n\n1. 点击页面顶部的"连接钱包"按钮\n2. 选择您的钱包类型\n3. 确认连接后返回此页面',
        false
      );
      return;
    }
    
    // 调试：检查循环次数参数
    console.log('循环次数参数检查:', { cycleCount, parsed: parseInt(cycleCount) });
    addDebugLog(`循环次数参数: ${cycleCount}, 解析后: ${parseInt(cycleCount)}`, 'info');
    
    if (!cycleCount || parseInt(cycleCount) <= 0) {
      console.log('❌ 循环次数参数无效');
      addDebugLog('❌ 循环次数参数无效', 'error');
      showErrorModal(
        '参数错误',
        '循环次数设置无效：\n\n请输入1-100之间的整数\n例如：5（表示循环5次）',
        false
      );
      return;
    }
    
    // 调试：检查USDT数量参数
    console.log('USDT数量参数检查:', { usdtAmountPerCycle, parsed: parseFloat(usdtAmountPerCycle) });
    addDebugLog(`USDT数量参数: ${usdtAmountPerCycle}, 解析后: ${parseFloat(usdtAmountPerCycle)}`, 'info');
    
    if (!usdtAmountPerCycle || parseFloat(usdtAmountPerCycle) <= 0) {
      console.log('❌ USDT数量参数无效');
      addDebugLog('❌ USDT数量参数无效', 'error');
      showErrorModal(
        '参数错误',
        'USDT数量设置无效：\n\n请输入大于0的数字\n例如：10（表示每次使用10个USDT）\n\n建议：首次使用建议小额测试',
        false
      );
      return;
    }
    
    // 调试：检查总USDT余额是否足够（包含手续费）
    const singleUsdtAmount = parseFloat(usdtAmountPerCycle);
    const totalCycles = parseInt(cycleCount);
    const feeRate = 0.0003; // 万分之三手续费
    const totalUsdtNeeded = singleUsdtAmount * (1 + totalCycles * feeRate);
    
    console.log('余额检查:', { 
      usdtBalance, 
      singleUsdtAmount,
      totalCycles,
      feeRate,
      totalUsdtNeeded, 
      currentBalance: parseFloat(usdtBalance),
      sufficient: parseFloat(usdtBalance) >= totalUsdtNeeded 
    });
    addDebugLog(`余额检查: 当前${parseFloat(usdtBalance).toFixed(6)} USDT`, 'info');
    addDebugLog(`单次USDT: ${singleUsdtAmount.toFixed(6)}, 循环次数: ${totalCycles}, 手续费率: ${(feeRate * 100).toFixed(2)}%`, 'info');
    addDebugLog(`总需要: ${singleUsdtAmount.toFixed(6)} × (1 + ${totalCycles} × ${feeRate}) = ${totalUsdtNeeded.toFixed(6)} USDT`, 'info');
    
    if (parseFloat(usdtBalance) < totalUsdtNeeded) {
      console.log('❌ USDT余额不足');
      addDebugLog('❌ USDT余额不足', 'error');
      const totalFees = singleUsdtAmount * totalCycles * feeRate;
      showErrorModal(
        'USDT余额不足',
        `无法开始循环交易，余额不足：\n\n单次USDT: ${singleUsdtAmount.toFixed(6)} USDT\n循环次数: ${totalCycles} 次\n预估手续费: ${totalFees.toFixed(6)} USDT (${(feeRate * 100).toFixed(2)}% × ${totalCycles}次)\n总需要: ${totalUsdtNeeded.toFixed(6)} USDT\n当前余额: ${parseFloat(usdtBalance).toFixed(6)} USDT\n缺少: ${(totalUsdtNeeded - parseFloat(usdtBalance)).toFixed(6)} USDT\n\n请充值USDT后再试`,
        false
      );
      return;
    }
    
    const totalFees = singleUsdtAmount * totalCycles * feeRate;
    const confirmMessage = `循环次数: ${totalCycles} 次\n每次USDT数量: ${singleUsdtAmount.toFixed(6)} USDT\n预估手续费: ${totalFees.toFixed(6)} USDT (${(feeRate * 100).toFixed(2)}% × ${totalCycles}次)\n总计需要: ${totalUsdtNeeded.toFixed(6)} USDT\n当前余额: ${parseFloat(usdtBalance).toFixed(6)} USDT`;
    
    console.log('🔔 即将显示自定义确认窗口');
    console.log('确认消息:', confirmMessage);
    addDebugLog('🔔 显示自定义确认窗口', 'info');
    
    const userConfirmed = await showConfirmModal('确认开始循环交易', confirmMessage);
    console.log('用户确认结果:', userConfirmed);
    addDebugLog(`用户确认结果: ${userConfirmed}`, userConfirmed ? 'success' : 'warning');
    
    if (!userConfirmed) {
      console.log('❌ 用户取消了循环交易');
      addDebugLog('❌ 用户取消了循环交易', 'warning');
      return;
    }
    
    console.log('✅ 用户确认开始循环交易，准备启动...');
    addDebugLog('✅ 用户确认开始循环交易，准备启动...', 'success');
    
    console.log('🚀 开始设置循环交易状态...');
    addDebugLog('🚀 开始设置循环交易状态...', 'info');
    
    setIsCycling(true);
    setCurrentCycle(0);
    setCycleHistory([]);
    shouldStopRef.current = false; // 重置停止标志
    setTotalActualUsdtReceived(0); // 重置累计实际收到的USDT总量
    
    console.log('✅ 循环交易状态已设置，进入主循环逻辑...');
    addDebugLog('✅ 循环交易状态已设置，进入主循环逻辑...', 'success');
    
    try {
      const totalCycles = parseInt(cycleCount);
      console.log('开始执行循环逻辑，总循环次数:', totalCycles);
      
      // 记录开始日志
      addDebugLog(`🚀 开始循环交易: ${totalCycles} 次循环，每次 ${parseFloat(usdtAmountPerCycle).toFixed(6)} USDT`, 'info');
      addDebugLog(`💰 总计需要: ${totalUsdtNeeded.toFixed(6)} USDT，当前余额: ${parseFloat(usdtBalance).toFixed(6)} USDT`, 'info');
      
      for (let i = 1; i <= totalCycles; i++) {
        // 检查是否被用户停止
        if (shouldStopRef.current) {
          setCycleStatus('循环交易已被用户停止');
          break;
        }
        
        setCurrentCycle(i);
        
        try {
          await performSingleCycle(i);
          setCycleStatus(`第 ${i} 次循环：完成`);
          
          // 短暂等待后进行下一次循环
          if (i < totalCycles) {
            setCycleStatus(`等待 1 秒后开始第 ${i + 1} 次循环...`);
            
            // 在等待期间也检查停止状态
            const waitTime = 1000;
            const checkInterval = 100;
            for (let waited = 0; waited < waitTime; waited += checkInterval) {
              if (shouldStopRef.current) {
                console.log('🛑 等待期间被用户停止');
                break;
              }
              await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
          }
          
        } catch (error) {
          console.error(`第 ${i} 次循环失败:`, error);
          
          // 检查是否是用户拒绝签名
          if (isUserRejectedError(error)) {
            console.log('🚫 用户拒绝签名，退出循环交易');
            setCycleStatus('用户拒绝签名，循环交易已停止');
            
            // 记录失败的循环
            const failedRecord = {
              cycle: i,
              usdtSpent: '0',
              usdtReceived: '0', 
              usdtDifference: '0',
              brBought: '0',
              brSold: '0',
              buyTx: '',
              sellTx: '',
              error: '用户拒绝签名',
              timestamp: new Date()
            };
            setCycleHistory(prev => [...prev, failedRecord]);
            
            // 直接退出循环
            break;
          }
          
          // 如果是用户停止，立即退出循环
          if (error.message.includes('用户停止')) {
            console.log('🛑 用户停止，退出循环');
            setCycleStatus('循环已被用户停止');
            break;
          }
          
          setCycleStatus(`第 ${i} 次循环失败: ${error.message} - 继续下一次循环...`);
          
          // 记录失败的循环
          const failedRecord = {
            cycle: i,
            usdtSpent: '0',
            usdtReceived: '0', 
            usdtDifference: '0',
            brBought: '0',
            brSold: '0',
            buyTx: '',
            sellTx: '',
            error: error.message,
            timestamp: new Date()
          };
          setCycleHistory(prev => [...prev, failedRecord]);
          
          // 等待1秒后继续下一次循环
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // 检查是否被用户停止
      if (shouldStopRef.current) {
        setCycleStatus('循环交易已被用户停止');
        addDebugLog('⏹️ 循环交易被用户手动停止', 'warning');
      } else {
        const successfulCycles = cycleHistory.filter(record => !record.error).length;
        const totalAttempted = cycleHistory.length;
        setCycleStatus(`循环交易完成！成功 ${successfulCycles}/${totalAttempted} 次，失败 ${totalAttempted - successfulCycles} 次`);
        addDebugLog(`🎉 循环交易全部完成！`, 'success');
        addDebugLog(`📊 统计结果: 成功 ${successfulCycles} 次，失败 ${totalAttempted - successfulCycles} 次`, 'success');
      }
      
      // 添加最终统计信息
      if (cycleHistory.length > 0) {
        const successfulCycles = cycleHistory.filter(record => !record.error);
        const totalSpent = successfulCycles.reduce((sum, record) => sum + parseFloat(record.usdtSpent || 0), 0);
        const totalReceived = successfulCycles.reduce((sum, record) => sum + parseFloat(record.actualUsdtReceived || record.usdtReceived || 0), 0);
        const totalDifference = totalReceived - totalSpent;
        
        addDebugLog(`📊 最终统计汇总:`, 'success');
        addDebugLog(`  总消耗: ${totalSpent.toFixed(6)} USDT`, 'info');
        addDebugLog(`  总实际收到: ${totalActualUsdtReceived.toFixed(6)} USDT`, 'info');
        addDebugLog(`  净差额: ${totalDifference.toFixed(6)} USDT`, totalDifference >= 0 ? 'success' : 'warning');
        addDebugLog(`  平均每次: ${successfulCycles.length > 0 ? (totalDifference / successfulCycles.length).toFixed(6) : '0.000000'} USDT`, 'info');
      }
      
    } catch (error) {
      console.error('循环交易失败:', error);
      
      // 检查是否是用户拒绝签名
      if (isUserRejectedError(error)) {
        setCycleStatus('用户拒绝签名，循环交易已停止');
        // 不显示错误警告，因为这是用户主动选择
      } else if (error.message.includes('用户停止')) {
        // 如果是用户停止，不显示错误警告
        setCycleStatus('循环交易已被用户停止');
      } else {
        setCycleStatus(`循环交易失败: ${error.message}`);
        // 使用新的错误弹窗替代alert
        showErrorModal(
          '循环交易失败',
          `循环交易过程中发生错误：\n${error.message}\n\n建议：\n1. 检查网络连接是否正常\n2. 确认钱包余额是否充足\n3. 查看调试日志了解详细信息`,
          true
        );
      }
    } finally {
      setIsCycling(false);
      setCurrentCycle(0);
    }
  };

  // 停止循环交易
  const stopCycleTrading = () => {
    shouldStopRef.current = true; // 设置停止标志
    setIsCycling(false); // 立即设置循环状态为false
    setCycleStatus('用户手动停止循环交易，已立即停止');
    addDebugLog('🛑 用户手动停止循环交易', 'warning');
    console.log('🛑 用户手动停止循环交易');
  };

  return (
    <div className="cycle-trading">
      <h2>🔄 循环交易</h2>
      <div className="page-info">
        <p className="trading-description">
          {PAGE_CONFIG.description}
        </p>
        <p className="disclaimer">
          {PAGE_CONFIG.disclaimer}
        </p>
      </div>

      {!account ? (
        <div className="no-wallet">
          <h3>⚠️ 请先连接钱包</h3>
          <p>需要连接钱包才能进行循环交易</p>
        </div>
      ) : (
        <div className="cycle-trading-container">
          {/* 交易参数设置 */}
          <div className="trading-params">
            <h3>📊 交易参数</h3>
            
            <div className="param-input">
              <label>选择交易代币:</label>
              <select 
                value={selectedToken} 
                onChange={(e) => setSelectedToken(e.target.value)}
                className="param-input-field"
                disabled={isCycling}
              >
                {Object.keys(TOKEN_CONFIGS).map(token => (
                  <option key={token} value={token}>
                    {TOKEN_CONFIGS[token].symbol}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="token-info">
              <p>当前代币: {TOKEN_CONFIGS[selectedToken]?.symbol || '未知'}</p>
              <p>代币地址: {TOKEN_B_ADDRESS}</p>
              <p>池地址: {POOL_ADDRESS}</p>
            </div>
            
            <div className="param-input">
              <label>每次USDT数量:</label>
              <input
                type="number"
                value={usdtAmountPerCycle}
                onChange={(e) => setUsdtAmountPerCycle(e.target.value)}
                placeholder="请输入每次使用的USDT数量"
                step="0.000001"
                min="0"
                disabled={isCycling}
                className="param-input-field"
              />
            </div>
            
            <div className="param-input">
              <label>循环次数:</label>
              <input
                type="number"
                value={cycleCount}
                onChange={(e) => setCycleCount(e.target.value)}
                placeholder="请输入循环次数"
                min="1"
                max="100"
                disabled={isCycling}
                className="param-input-field"
              />
            </div>
            
            <div className="balance-display">
              <div className="balance-header">
                <h4>💰 当前余额</h4>
                <button 
                  className="refresh-balance-btn"
                  onClick={refreshAllBalances}
                  disabled={isLoadingBalance}
                  title="刷新余额"
                >
                  {isLoadingBalance ? '🔄' : '↻'}
                </button>
              </div>
              <div className="balance-item">
                <span>当前USDT余额:</span>
                <span className="balance-value">
                  {isLoadingBalance ? '🔄 加载中...' : `${parseFloat(usdtBalance).toFixed(6)} USDT`}
                </span>
              </div>
              <div className="balance-item">
                <span>当前{TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}余额:</span>
                <span className="balance-value">
                  {isLoadingBalance ? '🔄 加载中...' : `${parseFloat(brBalance).toFixed(6)} ${TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}`}
                </span>
              </div>
              {lastBalanceUpdate && (
                <div className="balance-update-time">
                  最后更新: {lastBalanceUpdate.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>

          {/* 交易控制 */}
          <div className="trading-controls">
            <button
              className={isCycling ? 'stop-cycle-btn' : 'start-cycle-btn'}
              onClick={isCycling ? stopCycleTrading : startCycleTrading}
            >
              {isCycling ? '停止循环交易' : '开始循环交易'}
            </button>
          </div>

          {/* 循环状态 */}
          {(isCycling || cycleStatus) && (
            <div className="cycle-status">
              <h3>📈 循环状态</h3>
              <div className="status-info">
                <div className="status-item">
                  <span>当前循环:</span>
                  <span>{currentCycle} / {cycleCount}</span>
                </div>
                <div className="status-item">
                  <span>已完成循环:</span>
                  <span>{cycleHistory.length} 次</span>
                </div>
                <div className="status-item">
                  <span>状态:</span>
                  <span>{cycleStatus}</span>
                </div>
              </div>
            </div>
          )}

          {/* 循环历史 */}
          {cycleHistory.length > 0 && (
            <div className="cycle-history">
              <h3>📋 循环历史</h3>
              
              {/* 总计统计 */}
              {(() => {
                const successfulCycles = cycleHistory.filter(record => !record.error);
                const totalSpent = successfulCycles.reduce((sum, record) => sum + parseFloat(record.usdtSpent || 0), 0);
                // 优先使用实际收到的USDT数量，如果没有则使用原来的usdtReceived
                const totalReceived = successfulCycles.reduce((sum, record) => sum + parseFloat(record.actualUsdtReceived || record.usdtReceived || 0), 0);
                const totalDifference = totalReceived - totalSpent;
                const successCount = successfulCycles.length;
                const failedCount = cycleHistory.filter(record => record.error).length;
                
                // 计算总滑点
                const totalSlippage = successfulCycles.reduce((sum, record) => {
                  if (record.slippage) {
                    return sum + parseFloat(record.slippage);
                  }
                  return sum;
                }, 0);
                const averageSlippage = successCount > 0 ? (totalSlippage / successCount).toFixed(4) : '0.0000';
                
                return (
                  <div className="cycle-summary">
                    <h4>📊 总计统计</h4>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <span>成功循环:</span>
                        <span className="summary-value">{successCount} 次</span>
                      </div>
                      <div className="summary-item">
                        <span>失败循环:</span>
                        <span className="summary-value">{failedCount} 次</span>
                      </div>
                      <div className="summary-item">
                        <span>总消耗:</span>
                        <span className="summary-value consumed">{totalSpent.toFixed(6)} USDT</span>
                      </div>
                      <div className="summary-item">
                        <span>总回收:</span>
                        <span className="summary-value received">{totalReceived.toFixed(6)} USDT</span>
                      </div>
                      <div className="summary-item">
                        <span>实际收到:</span>
                        <span className="summary-value received">{totalActualUsdtReceived.toFixed(6)} USDT</span>
                      </div>
                      <div className="summary-item">
                        <span>净差额:</span>
                        <span className={`summary-value ${totalDifference >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                          {totalDifference >= 0 ? '+' : ''}{totalDifference.toFixed(6)} USDT
                        </span>
                      </div>
                      <div className="summary-item">
                        <span>平均每次:</span>
                        <span className={`summary-value ${successCount > 0 ? (totalDifference/successCount >= 0 ? 'profit-positive' : 'profit-negative') : ''}`}>
                          {successCount > 0 ? (totalDifference >= 0 ? '+' : '') + (totalDifference/successCount).toFixed(6) + ' USDT' : '无数据'}
                        </span>
                      </div>
                      <div className="summary-item">
                        <span>平均滑点:</span>
                        <span className={`summary-value ${parseFloat(averageSlippage) >= 0 ? 'slippage-positive' : 'slippage-negative'}`}>
                          {averageSlippage}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              <div className="history-list">
                {cycleHistory.map((record, index) => (
                  <div key={index} className={`history-item ${record.error ? 'history-item-failed' : ''}`}>
                    <div className="history-header">
                      <span>第 {record.cycle} 次循环 {record.error ? '❌' : '✅'}</span>
                      {record.error ? (
                        <span className="error-text">失败</span>
                      ) : (
                        <span className={parseFloat(record.usdtDifference) >= 0 ? 'profit-positive' : 'profit-negative'}>
                          {record.usdtDifference} USDT
                        </span>
                      )}
                    </div>
                    <div className="history-details">
                      {record.error ? (
                        <span>错误: {record.error}</span>
                      ) : (
                        <>
                          <span>消耗: {record.usdtSpent} USDT</span>
                          <span>实际收到: {record.actualUsdtReceived || record.usdtReceived} USDT</span>
                          {record.expectedUsdtReceived && record.actualUsdtReceived && (
                            <span>预期收到: {record.expectedUsdtReceived} USDT</span>
                          )}
                          {record.slippage && (
                            <span className={parseFloat(record.slippage) >= 0 ? 'slippage-positive' : 'slippage-negative'}>
                              滑点: {record.slippage}%
                            </span>
                          )}
                          <span>购买: {record.brBought} {TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}</span>
                          <span>卖出: {record.brSold} {TOKEN_CONFIGS[selectedToken]?.symbol || 'TOKEN'}</span>
                        </>
                      )}
                      <span>时间: {record.timestamp.toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 调试日志 */}
          <div className="debug-logs-section">
            <div className="debug-logs-header">
              <h3>🔍 调试日志</h3>
              <div className="debug-logs-controls">
                <button
                  className="toggle-logs-btn"
                  onClick={() => setShowDebugLogs(!showDebugLogs)}
                >
                  {showDebugLogs ? '隐藏日志' : '显示日志'}
                </button>
                <button
                  className="clear-logs-btn"
                  onClick={clearDebugLogs}
                  disabled={debugLogs.length === 0}
                >
                  清空日志
                </button>
              </div>
            </div>
            
            {showDebugLogs && (
              <div className="debug-logs-content">
                {debugLogs.length === 0 ? (
                  <div className="no-logs">暂无日志</div>
                ) : (
                  <div className="logs-list">
                    {debugLogs.map((log) => (
                      <div key={log.id} className={`log-item log-${log.level}`}>
                        <span className="log-timestamp">{log.timestamp}</span>
                        <span className="log-message">{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 注意事项 */}
          <div className="notice-section">
            <h3>⚠️ 注意事项</h3>
            <ul>
              <li>循环交易存在风险，请谨慎操作</li>
              <li>每次循环需要消耗Gas费用</li>
              <li>价格波动可能导致亏损</li>
              <li>建议先小额测试后再大额交易</li>
              <li>循环过程中请勿关闭页面</li>
              <li>💡 移动端可点击"显示日志"查看详细操作日志</li>
              <li>🔧 遇到问题可查看调试日志进行故障排除</li>
            </ul>
          </div>
        </div>
      )}

      {/* 错误弹窗 */}
      {errorModal.show && (
        <div className="error-modal-overlay" onClick={closeErrorModal}>
          <div className="error-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="error-modal-header">
              <h3>⚠️ {errorModal.title}</h3>
              <button className="error-modal-close" onClick={closeErrorModal}>×</button>
            </div>
            
            <div className="error-modal-body">
              <div className="error-message">
                {errorModal.message.split('\n').map((line, index) => (
                  <div key={index}>{line}</div>
                ))}
              </div>
              
              {errorModal.logs.length > 0 && (
                <div className="error-logs-section">
                  <h4>📋 相关日志：</h4>
                  <div className="error-logs-list">
                    {errorModal.logs.map((log) => (
                      <div key={log.id} className={`error-log-item error-log-${log.level}`}>
                        <span className="error-log-timestamp">{log.timestamp}</span>
                        <span className="error-log-message">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="error-modal-footer">
              <button className="error-modal-view-logs" onClick={() => {
                setShowDebugLogs(true);
                closeErrorModal();
              }}>
                查看完整日志
              </button>
              <button className="error-modal-ok" onClick={closeErrorModal}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 确认弹窗 */}
      {confirmModal.show && (
        <div className="confirm-modal-overlay" onClick={confirmModal.onCancel}>
          <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>❓ {confirmModal.title}</h3>
            </div>
            
            <div className="confirm-modal-body">
              <div className="confirm-message">
                {confirmModal.message.split('\n').map((line, index) => (
                  <div key={index} className="confirm-message-line">
                    {line}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="confirm-modal-footer">
              <button className="confirm-modal-cancel" onClick={confirmModal.onCancel}>
                取消
              </button>
              <button className="confirm-modal-ok" onClick={confirmModal.onConfirm}>
                确认开始
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 版本信息 */}
      <div className="version-info">
        <div className="version-content">
          <span className="version-text">
            {VERSION_INFO.description} {VERSION_INFO.version}
          </span>
          <span className="build-info">
            构建时间: {VERSION_INFO.buildTime} | Git: {VERSION_INFO.gitHash}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CycleTrading; 