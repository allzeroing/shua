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
  const shouldStopRef = useRef(false); // 用于控制是否停止循环

  // 合约地址
  const CONTRACT_ADDRESS = '0xb300000b72DEAEb607a12d5f54773D1C19c7028d';
  
  // 代币地址
  const USDT_ADDRESS = '0x55d398326f99059ff775485246999027b3197955';
  const BR_ADDRESS = '0xff7d6a96ae471bbcd7713af9cb1feeb16cf56b41';
  
  // PancakeSwap V3 地址
  const V3_POOL_ADDRESS = '0x380aaDF63D84D3A434073F1d5d95f02fB23d5228';

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
      
      const slot0Result = await provider.call({
        to: V3_POOL_ADDRESS,
        data: '0x3850c7bd' // slot0() 方法ID
      });
      
      if (!slot0Result || slot0Result === '0x') {
        console.error('❌ 无法获取V3 slot0信息');
        return '0';
      }
      
      const sqrtPriceX96Hex = '0x' + slot0Result.slice(2, 66);
      const sqrtPriceX96 = ethers.getBigInt(sqrtPriceX96Hex);
      
      const Q96 = ethers.getBigInt('79228162514264337593543950336');
      const sqrtPriceNumber = Number(sqrtPriceX96.toString()) / Number(Q96.toString());
      const price = sqrtPriceNumber * sqrtPriceNumber;
      
      let brOutput;
      const usdtAmountFloat = parseFloat(usdtAmountInput);
      
      if (price > 0.001 && price < 1000) {
        brOutput = (usdtAmountFloat * price).toString();
      } else if (price > 1000) {
        const inversedPrice = 1 / price;
        brOutput = (usdtAmountFloat * inversedPrice).toString();
      } else {
        brOutput = (usdtAmountFloat / price).toString();
      }
      
      const brOutputFloat = parseFloat(brOutput);
      if (brOutputFloat <= 0 || brOutputFloat > 1000000000) {
        console.warn('计算结果不合理，使用备用方案');
        brOutput = (usdtAmountFloat * 100).toString();
      }
      
      return brOutput;
      
    } catch (error) {
      console.error('=== V3价格查询失败 ===');
      console.error('错误信息:', error.message);
      console.error('完整错误:', error);
      console.error('输入USDT数量:', usdtAmountInput);
      console.error('V3池地址:', V3_POOL_ADDRESS);
      console.error('Provider状态:', provider ? '正常' : '空值');
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
      
      const slot0Result = await provider.call({
        to: V3_POOL_ADDRESS,
        data: '0x3850c7bd' // slot0() 方法ID
      });
      
      const sqrtPriceX96Hex = '0x' + slot0Result.slice(2, 66);
      const sqrtPriceX96 = ethers.getBigInt(sqrtPriceX96Hex);
      
      const Q96 = ethers.getBigInt('79228162514264337593543950336');
      const sqrtPriceNumber = Number(sqrtPriceX96.toString()) / Number(Q96.toString());
      const price = sqrtPriceNumber * sqrtPriceNumber;
      
      const brAmountFloat = parseFloat(brAmountInput);
      let usdtOutput;
      
      if (price > 0.001 && price < 1000) {
        usdtOutput = (brAmountFloat / price).toString();
      } else if (price > 1000) {
        usdtOutput = (brAmountFloat * price).toString();
      } else {
        usdtOutput = (brAmountFloat * price).toString();
      }
      
      const usdtOutputFloat = parseFloat(usdtOutput);
      if (usdtOutputFloat <= 0 || isNaN(usdtOutputFloat)) {
        console.error('❌ 计算结果无效:', usdtOutput);
        return '0';
      }
      
      return usdtOutputFloat.toFixed(8);
      
    } catch (error) {
      console.error('=== V3反向价格查询失败 ===');
      console.error('错误信息:', error.message);
      console.error('完整错误:', error);
      console.error('输入BR数量:', brAmountInput);
      console.error('V3池地址:', V3_POOL_ADDRESS);
      console.error('Provider状态:', provider ? '正常' : '空值');
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
      const balanceOfData = '0x70a08231' + account.slice(2).padStart(64, '0');
      const result = await provider.call({
        to: BR_ADDRESS,
        data: balanceOfData
      });
      
      const balanceInEther = ethers.formatEther(result);
      setBrBalance(balanceInEther);
      
      return balanceInEther;
      
    } catch (error) {
      console.error('=== 获取BR余额失败 ===');
      console.error('错误信息:', error.message);
      console.error('完整错误:', error);
      console.error('账户地址:', account);
      console.error('BR代币地址:', BR_ADDRESS);
      console.error('Provider状态:', provider ? '正常' : '空值');
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
      const balanceOfData = '0x70a08231' + account.slice(2).padStart(64, '0');
      const result = await provider.call({
        to: USDT_ADDRESS,
        data: balanceOfData
      });
      
      const balanceInEther = ethers.formatEther(result);
      setUsdtBalance(balanceInEther);
      
      return balanceInEther;
      
    } catch (error) {
      console.error('=== 获取USDT余额失败 ===');
      console.error('错误信息:', error.message);
      console.error('完整错误:', error);
      console.error('账户地址:', account);
      console.error('USDT代币地址:', USDT_ADDRESS);
      console.error('Provider状态:', provider ? '正常' : '空值');
      setUsdtBalance('0');
      return '0';
    }
  };

  // 刷新所有代币余额
  const refreshAllBalances = async () => {
    try {
      setIsLoadingBalance(true);
      console.log('开始刷新所有余额...');
      const results = await Promise.all([getBRBalance(), getUSDTBalance()]);
      console.log('余额刷新完成:', {
        BR: results[0],
        USDT: results[1]
      });
      setLastBalanceUpdate(new Date());
      return results;
    } catch (error) {
      console.error('=== 刷新余额失败 ===');
      console.error('错误信息:', error.message);
      console.error('完整错误:', error);
      return ['0', '0'];
    } finally {
      setIsLoadingBalance(false);
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
    console.log('当前毫秒时间戳:', currentTime);
    console.log('截止毫秒时间戳:', deadline);
    console.log('截止时间十六进制:', deadlineHex);
    console.log('时间戳第一部分(参数11后28字节):', timestampPart1);
    console.log('时间戳第二部分(参数12前4字节):', timestampPart2);
    console.log('USDT数量:', usdtAmount);
    console.log('USDT数量十六进制:', usdtAmountHex);
    console.log('USDT第一部分(参数16后28字节):', usdtPart1);
    console.log('USDT第二部分(参数17前4字节):', usdtPart2);
    console.log('BR数量:', brAmount);
    console.log('BR数量十六进制:', brAmountHex);
    console.log('BR完整数量(参数4):', brAmountHex);
    console.log('BR第一部分(参数10后28字节):', brPart1);
    console.log('BR第二部分(参数11前4字节):', brPart2);
    
    // 您提供的完整交易数据
    const methodId = '0xe5e8894b';
    
    let params;
    
    if (isUsdtToBr) {
      // USDT -> BR 交易参数
      params = [
        '0000000000000000000000005efc784d444126ecc05f22c49ff3fbd7d9f4868a', // 参数0
        '00000000000000000000000055d398326f99059ff775485246999027b3197955', // 参数1
        usdtAmountHex, // 参数2: USDT数量
        '000000000000000000000000ff7d6a96ae471bbcd7713af9cb1feeb16cf56b41', // 参数3
        brAmountHex, // 参数4: BR数量
        '00000000000000000000000000000000000000000000000000000000000000c0', // 参数5
        '0000000000000000000000000000000000000000000000000000000000000404', // 参数6
        '9aa9035600000000000000000000000000000000000000000000000000000000', // 参数7
        '0000000000000000000000000000000055d398326f99059ff775485246999027', // 参数8
        'b3197955000000000000000000000000ff7d6a96ae471bbcd7713af9cb1feeb1', // 参数9
        '6cf56b41' + brPart1, // 参数10: 前4字节固定 + 后28字节BR数量
        brPart2 + timestampPart1, // 参数11: 前4字节BR数量 + 后28字节时间戳
        timestampPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数12: 前4字节时间戳 + 后28字节固定
        '0000010000000000000000000000000000000000000000000000000000000000', // 参数13
        '0000014000000000000000000000000000000000000000000000000000000000', // 参数14
        '0000000000000000000000000000000000000000000000000000000000000000', // 参数15
        '00000001' + usdtPart1, // 参数16: 前4字节固定 + 后28字节USDT数量
        usdtPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数17: 前4字节USDT数量 + 后28字节固定
        '0000000100000000000000000000000000000000000000000000000000000000', // 参数18
        '0000002000000000000000000000000000000000000000000000000000000000', // 参数19
        '0000000100000000000000000000000000000000000000000000000000000000', // 参数20
        '0000002000000000000000000000000000000000000000000000000000000000', // 参数21
        '000000a000000000000000000000000000000000000000000000000000000000', // 参数22
        '000000e000000000000000000000000000000000000000000000000000000000', // 参数23
        '0000012000000000000000000000000000000000000000000000000000000000', // 参数24
        '0000016000000000000000000000000055d398326f99059ff775485246999027', // 参数25
        'b319795500000000000000000000000000000000000000000000000000000000', // 参数26
        '0000000102000000000000000000000000000000000000000000000000000000', // 参数27
        '0000000000000000000000000000000000000000000000000000000000000000', // 参数28
        '000000010000000000000000000000005efc784d444126ecc05f22c49ff3fbd7', // 参数29
        'd9f4868a00000000000000000000000000000000000000000000000000000000', // 参数30
        '00000001000000000000000000002710380aadf63d84d3a434073f1d5d95f02f', // 参数31
        'b23d522800000000000000000000000000000000000000000000000000000000', // 参数32
        '0000000100000000000000000000000000000000000000000000000000000000', // 参数33
        '0000002000000000000000000000000000000000000000000000000000000000', // 参数34
        '0000008000000000000000000000000000000000000000000000000000000000', // 参数35
        '0000000000000000000000000000000055d398326f99059ff775485246999027', // 参数36
        'b3197955000000000000000000000000ff7d6a96ae471bbcd7713af9cb1feeb1', // 参数37
        '6cf56b4100000000000000000000000000000000000000000000000000000000', // 参数38
        '0000006400000000000000000000000000000000000000000000000000000000'  // 参数39
      ];
    } else {
      // BR -> USDT 交易参数
      params = [
        '0000000000000000000000005efc784d444126ecc05f22c49ff3fbd7d9f4868a', // 参数0
        '000000000000000000000000ff7d6a96ae471bbcd7713af9cb1feeb16cf56b41', // 参数1
        brAmountHex, // 参数2: BR数量
        '00000000000000000000000055d398326f99059ff775485246999027b3197955', // 参数3
        usdtAmountHex, // 参数4: USDT数量
        '00000000000000000000000000000000000000000000000000000000000000c0', // 参数5
        '0000000000000000000000000000000000000000000000000000000000000404', // 参数6
        '9aa9035600000000000000000000000000000000000000000000000000000000', // 参数7
        '00000000000000000000000000000000ff7d6a96ae471bbcd7713af9cb1feeb1', // 参数8
        '6cf56b4100000000000000000000000055d398326f99059ff775485246999027', // 参数9
        'b3197955' + usdtPart1, // 参数10: 前4字节固定 + 后28字节USDT数量
        usdtPart2 + timestampPart1, // 参数11: 前4字节USDT数量 + 后28字节时间戳
        timestampPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数12: 前4字节时间戳 + 后28字节固定
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
        '00000160000000000000000000000000ff7d6a96ae471bbcd7713af9cb1feeb1', // 参数25
        '6cf56b4100000000000000000000000000000000000000000000000000000000', // 参数26
        '0000000102000000000000000000000000000000000000000000000000000000', // 参数27
        '0000000000000000000000000000000000000000000000000000000000000000', // 参数28
        '000000010000000000000000000000005efc784d444126ecc05f22c49ff3fbd7', // 参数29
        'd9f4868a00000000000000000000000000000000000000000000000000000000', // 参数30
        '00000001000000000000000000002710380aadf63d84d3a434073f1d5d95f02f', // 参数31
        'b23d522800000000000000000000000000000000000000000000000000000000', // 参数32
        '0000000100000000000000000000000000000000000000000000000000000000', // 参数33
        '0000002000000000000000000000000000000000000000000000000000000000', // 参数34
        '0000008000000000000000000000000000000000000000000000000000000000', // 参数35
        '00000000000000000000000000000000ff7d6a96ae471bbcd7713af9cb1feeb1', // 参数36
        '6cf56b4100000000000000000000000055d398326f99059ff775485246999027', // 参数37
        'b319795500000000000000000000000000000000000000000000000000000000', // 参数38
        '0000006400000000000000000000000000000000000000000000000000000000'  // 参数39
      ];
    }
    
    console.log('=== 循环交易类型 ===');
    console.log('交易方向:', isUsdtToBr ? 'USDT -> BR' : 'BR -> USDT');
    console.log('使用的参数数组:', isUsdtToBr ? 'USDT->BR参数' : 'BR->USDT参数');

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
      await refreshAllBalances();
      const brBalanceBeforeBuy = parseFloat(brBalance); // 记录购买前的BR余额
      
      // 检查是否被用户停止
      if (shouldStopRef.current) {
        throw new Error('用户停止：循环被中断');
      }
      
      // 第一步：用USDT购买BR
      setCycleStatus(`第 ${cycleIndex} 次循环：计算购买BR数量...`);
      const expectedBRAmount = await getAmountOutV3(usdtAmountPerCycle);
      
      if (parseFloat(expectedBRAmount) <= 0) {
        throw new Error('无法获取BR价格');
      }
      
      // 检查是否被用户停止
      if (shouldStopRef.current) {
        throw new Error('用户停止：循环被中断');
      }
      
      const minBRAmount = (parseFloat(expectedBRAmount) * 0.99985).toFixed(8);
      
      addDebugLog(`🔔 准备发起第 ${cycleIndex} 次循环的购买BR交易，即将拉起钱包...`, 'info');
      addDebugLog(`购买前BR余额: ${brBalanceBeforeBuy} BR`, 'info');
      setCycleStatus(`第 ${cycleIndex} 次循环：准备购买BR，等待钱包签名...`);
      
      const buyReceipt = await executeTransaction(true, usdtAmountPerCycle, minBRAmount);
      
      addDebugLog(`✅ 第 ${cycleIndex} 次循环的购买BR交易已完成，交易hash: ${buyReceipt.transactionHash}`, 'success');
      
      // 等待BR余额更新
      const minimumBrExpected = brBalanceBeforeBuy + parseFloat(minBRAmount) * 0.8; // 购买前余额 + 预期购买量的80%
      setCycleStatus(`第 ${cycleIndex} 次循环：等待BR余额更新...`);
      const currentBrBalance = await waitForBalanceUpdate(
        getBRBalance,
        minimumBrExpected,
        'BR余额'
      );
      
      // 计算实际购买到的BR数量
      const actualBrBought = parseFloat(currentBrBalance) - brBalanceBeforeBuy;
      addDebugLog(`📊 第 ${cycleIndex} 次循环购买BR统计:`, 'info');
      addDebugLog(`  购买前余额: ${brBalanceBeforeBuy} BR`, 'info');
      addDebugLog(`  购买后余额: ${parseFloat(currentBrBalance)} BR`, 'info');
      addDebugLog(`  实际购买: ${actualBrBought} BR`, 'info');
      addDebugLog(`  预期购买: ${parseFloat(expectedBRAmount)} BR`, 'info');
      
      // 检查是否被用户停止
      if (shouldStopRef.current) {
        throw new Error('用户停止：循环被中断');
      }
      
      // 验证是否购买到了足够的BR
      if (actualBrBought <= 0) {
        addDebugLog(`❌ 购买BR失败，实际购买数量: ${actualBrBought}`, 'error');
        showErrorModal(
          '购买BR失败',
          `第 ${cycleIndex} 次循环购买BR失败：\n\n实际购买数量: ${actualBrBought} BR\n预期购买数量: ${parseFloat(expectedBRAmount)} BR\n\n可能原因：\n1. 交易滑点过大\n2. 流动性不足\n3. 网络拥堵导致交易失败\n\n建议：减少交易数量或稍后重试`,
          true
        );
        throw new Error(`购买BR失败，实际购买数量: ${actualBrBought}`);
      }
      
      setCycleStatus(`第 ${cycleIndex} 次循环：计算卖出USDT数量...`);
      // 重要：只计算实际购买到的BR数量能换回多少USDT，而不是使用总余额
      const expectedUSDTAmount = await getUsdtAmountFromBr(actualBrBought.toFixed(8));
      const minUSDTAmount = (parseFloat(expectedUSDTAmount) * 0.99985).toFixed(8);
      
      // 检查是否被用户停止
      if (shouldStopRef.current) {
        throw new Error('用户停止：循环被中断');
      }
      
      // 记录卖出前的USDT余额
      const usdtBalanceBeforeSell = await getUSDTBalance();
      
      setCycleStatus(`第 ${cycleIndex} 次循环：卖出BR...`);
      addDebugLog(`📊 第 ${cycleIndex} 次循环卖出参数:`, 'info');
      addDebugLog(`  卖出BR数量: ${actualBrBought.toFixed(8)} BR`, 'info');
      addDebugLog(`  总BR余额: ${currentBrBalance} BR`, 'info');
      addDebugLog(`  预期USDT输出: ${expectedUSDTAmount} USDT`, 'info');
      addDebugLog(`  最低USDT输出: ${minUSDTAmount} USDT`, 'info');
      addDebugLog(`  卖出前USDT余额: ${usdtBalanceBeforeSell} USDT`, 'info');
      
      addDebugLog(`🔔 准备发起第 ${cycleIndex} 次循环的卖BR交易，即将拉起钱包...`, 'info');
      addDebugLog(`🔥 重要：只卖出本次购买的 ${actualBrBought.toFixed(8)} BR，保留用户原有的BR`, 'warning');
      setCycleStatus(`第 ${cycleIndex} 次循环：准备卖出BR，等待钱包签名...`);
      
      // executeTransaction(isUsdtToBr, usdtAmount, brAmount)
      // BR->USDT: usdtAmount=期望输出, brAmount=输入数量
      // 重要修改：使用 actualBrBought 而不是 currentBrBalance
      const sellReceipt = await executeTransaction(false, minUSDTAmount, actualBrBought.toFixed(8));
      
      addDebugLog(`✅ 第 ${cycleIndex} 次循环的卖BR交易已完成，交易hash: ${sellReceipt.transactionHash}`, 'success');
      
      // 等待USDT余额更新
      const expectedUsdtBalanceAfterSell = parseFloat(usdtBalanceBeforeSell) + parseFloat(minUSDTAmount) * 0.8; // 预期的80%作为最小值
      setCycleStatus(`第 ${cycleIndex} 次循环：等待USDT余额更新...`);
      await waitForBalanceUpdate(
        getUSDTBalance,
        expectedUsdtBalanceAfterSell,
        'USDT余额'
      );
      
      // 计算本次循环的USDT消耗和回收
      const usdtSpent = parseFloat(usdtAmountPerCycle);
      const usdtReceived = parseFloat(expectedUSDTAmount); // 预期收到的USDT数量
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
        timestamp: new Date()
      };
      
      setCycleHistory(prev => [...prev, cycleRecord]);
      
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
    
    // 调试：检查总USDT余额是否足够
    const totalUsdtNeeded = parseFloat(usdtAmountPerCycle) * parseInt(cycleCount);
    console.log('余额检查:', { 
      usdtBalance, 
      totalUsdtNeeded, 
      currentBalance: parseFloat(usdtBalance),
      sufficient: parseFloat(usdtBalance) >= totalUsdtNeeded 
    });
    addDebugLog(`余额检查: 当前${parseFloat(usdtBalance).toFixed(6)} USDT, 需要${totalUsdtNeeded.toFixed(6)} USDT`, 'info');
    
    if (parseFloat(usdtBalance) < totalUsdtNeeded) {
      console.log('❌ USDT余额不足');
      addDebugLog('❌ USDT余额不足', 'error');
      showErrorModal(
        'USDT余额不足',
        `无法开始循环交易，余额不足：\n\n需要: ${totalUsdtNeeded.toFixed(6)} USDT\n当前: ${parseFloat(usdtBalance).toFixed(6)} USDT\n缺少: ${(totalUsdtNeeded - parseFloat(usdtBalance)).toFixed(6)} USDT\n\n请充值USDT后再试`,
        false
      );
      return;
    }
    
    const confirmMessage = `确认开始循环交易:\n` +
      `循环次数: ${cycleCount} 次\n` +
      `每次USDT数量: ${parseFloat(usdtAmountPerCycle).toFixed(6)} USDT\n` +
      `总计需要: ${totalUsdtNeeded.toFixed(6)} USDT\n` +
      `当前余额: ${parseFloat(usdtBalance).toFixed(6)} USDT\n` +
      `是否确认开始？`;
    
    console.log('🔔 即将显示确认窗口');
    console.log('确认消息:', confirmMessage);
    addDebugLog('🔔 显示确认窗口', 'info');
    
    const userConfirmed = window.confirm(confirmMessage);
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
      <p className="trading-description">
        自动化循环交易：购买BR → 卖出BR → 重复循环
      </p>

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
                <span>当前BR余额:</span>
                <span className="balance-value">
                  {isLoadingBalance ? '🔄 加载中...' : `${parseFloat(brBalance).toFixed(6)} BR`}
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
                const totalReceived = successfulCycles.reduce((sum, record) => sum + parseFloat(record.usdtReceived || 0), 0);
                const totalDifference = totalReceived - totalSpent;
                const successCount = successfulCycles.length;
                const failedCount = cycleHistory.filter(record => record.error).length;
                
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
                          <span>回收: {record.usdtReceived} USDT</span>
                          <span>购买: {record.brBought} BR</span>
                          <span>卖出: {record.brSold} BR</span>
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
    </div>
  );
};

export default CycleTrading; 