import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './FixedTrade.css';

const FixedTrade = ({ account, provider, chainId }) => {
  const [isTrading, setIsTrading] = useState(false);
  const [tradeType, setTradeType] = useState(''); // 'usdt-to-br' 或 'br-to-usdt'
  const [usdtAmount, setUsdtAmount] = useState(''); // USDT数量输入
  const [brAmount, setBrAmount] = useState(''); // BR数量输入
  const [brBalance, setBrBalance] = useState('0'); // BR余额
  const [usdtBalance, setUsdtBalance] = useState('0'); // USDT余额
  const [priceQueryTimer, setPriceQueryTimer] = useState(null); // 价格查询防抖定时器
  const [isLoadingPrice, setIsLoadingPrice] = useState(false); // 价格查询加载状态
  const [lastBalanceUpdate, setLastBalanceUpdate] = useState(null); // 最后余额更新时间
  const [isLoadingBalance, setIsLoadingBalance] = useState(false); // 余额加载状态

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

  // 页面可见性变化时刷新余额
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && account && provider) {
        // 只有当上次更新超过30秒时才刷新，避免频繁刷新
        const now = new Date();
        const shouldRefresh = !lastBalanceUpdate || 
          (now - lastBalanceUpdate) > 30000; // 30秒
        
        if (shouldRefresh) {
          console.log('页面获得焦点，刷新代币余额...');
          refreshAllBalances();
        } else {
          console.log('页面获得焦点，但余额数据较新，跳过刷新');
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [account, provider, lastBalanceUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

  // 清理定时器
  useEffect(() => {
    return () => {
      if (priceQueryTimer) {
        clearTimeout(priceQueryTimer);
      }
    };
  }, [priceQueryTimer]);

  // 合约地址
  const CONTRACT_ADDRESS = '0xb300000b72DEAEb607a12d5f54773D1C19c7028d';
  
  // 代币地址
  const USDT_ADDRESS = '0x55d398326f99059ff775485246999027b3197955';
  const BR_ADDRESS = '0xff7d6a96ae471bbcd7713af9cb1feeb16cf56b41';
  
  // PancakeSwap V3 地址
  const V3_POOL_ADDRESS = '0x380aaDF63D84D3A434073F1d5d95f02fB23d5228'; // V3 Pool 合约地址 
  const SMART_ROUTER_V3_ADDRESS = '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4'; // V3 SmartRouter
  
  // V3 查询价格：从 Pool 合约的 slot0 获取 sqrtPriceX96 计算价格
  const getAmountOutV3 = async (usdtAmountInput) => {
    if (!usdtAmountInput || !provider || parseFloat(usdtAmountInput) <= 0) {
      return '0';
    }
    
    try {
      console.log('=== 使用PancakeSwap V3 Pool slot0 查询价格 ===');
      console.log('输入USDT数量:', usdtAmountInput);
      console.log('V3 Pool地址:', V3_POOL_ADDRESS);
      
      // 调用 slot0() 获取当前价格信息
      // function slot0() external view returns (
      //   uint160 sqrtPriceX96,
      //   int24 tick,
      //   uint16 observationIndex,
      //   uint16 observationCardinality,
      //   uint16 observationCardinalityNext,
      //   uint32 feeProtocol,
      //   bool unlocked
      // )
      const slot0Result = await provider.call({
        to: V3_POOL_ADDRESS,
        data: '0x3850c7bd' // slot0() 方法ID
      });
      
      if (!slot0Result || slot0Result === '0x') {
        console.error('❌ 无法获取V3 slot0信息');
        return '0';
      }
      
      console.log('slot0调用结果:', slot0Result);
      
      // 解析 sqrtPriceX96 (前32字节)
      const sqrtPriceX96Hex = '0x' + slot0Result.slice(2, 66);
      const sqrtPriceX96 = ethers.getBigInt(sqrtPriceX96Hex);
      
      console.log('sqrtPriceX96 (hex):', sqrtPriceX96Hex);
      console.log('sqrtPriceX96:', sqrtPriceX96.toString());
      
      // 计算实际价格 - 使用精确的数学方法
      // sqrtPriceX96 = sqrt(price) * 2^96
      // price = (sqrtPriceX96 / 2^96)^2
      
      console.log('sqrtPriceX96:', sqrtPriceX96.toString());
      
      // 将USDT数量转换为Wei
      const usdtAmountWei = ethers.parseUnits(usdtAmountInput.toString(), 18);
      
      // 为避免极大数运算，分步计算
      // 2^96 = 79228162514264337593543950336
      const Q96 = ethers.getBigInt('79228162514264337593543950336');
      
      // 先用 JavaScript Number 类型计算价格，得到合理的浮点数
      // 将 BigInt 转换为 Number 进行浮点运算（注意：可能有精度损失，但对于价格估算足够）
      const sqrtPriceNumber = Number(sqrtPriceX96.toString()) / Number(Q96.toString());
      const price = sqrtPriceNumber * sqrtPriceNumber;
      
      console.log('计算出的 sqrtPrice (浮点数):', sqrtPriceNumber);
      console.log('计算出的 price (浮点数):', price);
      
      // 现在判断这个价格是 token1/token0 还是 token0/token1
      // 通过常识判断：一般 1 USDT 应该能换到一定数量的项目代币
      
      let brOutput;
      const usdtAmountFloat = parseFloat(usdtAmountInput);
      
      if (price > 0.001 && price < 1000) {
        // 如果价格在合理范围内，直接使用
        // price 表示每个 token0 能换多少个 token1
        // 需要确定哪个是 USDT，哪个是 BR
        brOutput = (usdtAmountFloat * price).toString();
        console.log('使用直接价格计算: USDT * price =', brOutput);
      } else if (price > 1000) {
        // 价格太高，可能需要取倒数
        const inversedPrice = 1 / price;
        brOutput = (usdtAmountFloat * inversedPrice).toString();
        console.log('使用倒数价格计算: USDT / price =', brOutput);
      } else {
        // 价格太低，可能是另一个方向
        brOutput = (usdtAmountFloat / price).toString();
        console.log('使用除法价格计算: USDT / price =', brOutput);
      }
      
      // 验证结果是否合理
      const brOutputFloat = parseFloat(brOutput);
      if (brOutputFloat <= 0 || brOutputFloat > 1000000000) {
        console.warn('计算结果不合理，使用备用方案');
        // 使用简单的比例关系作为备用
        brOutput = (usdtAmountFloat * 100).toString(); // 假设 1 USDT = 100 BR 作为fallback
      }
      
      console.log('计算出的BR输出数量:', brOutput);
      
      // 计算价格信息用于显示
      const pricePerUSDT = parseFloat(brOutput) / parseFloat(usdtAmountInput);
      console.log('V3价格: 1 USDT =', pricePerUSDT.toFixed(8), 'BR');
      
      return brOutput;
      
    } catch (error) {
      console.error('V3价格查询失败:', error);
      console.error('错误详情:', error.message);
      return '0';
    }
  };



  // 计算最小BR数量（99.985%滑点保护）
  const calculateMinBRAmount = async (usdtAmountInput) => {
    if (!usdtAmountInput || parseFloat(usdtAmountInput) <= 0) {
      setBrAmount('');
      setIsLoadingPrice(false);
      return;
    }
    
    try {
      setIsLoadingPrice(true);
      console.log('=== 计算最小BR数量 (使用V3) ===');
      
      // 查询可以得到的BR数量
      const expectedBRAmount = await getAmountOutV3(usdtAmountInput);
      console.log('V3预期BR数量:', expectedBRAmount);
      
      if (parseFloat(expectedBRAmount) > 0) {
        // 计算99.985%的数量（0.015%滑点）
        const minBRAmount = (parseFloat(expectedBRAmount) * 0.99985).toFixed(8);
        console.log('最小BR数量(99.985%):', minBRAmount);
        
        // 自动设置BR数量
        setBrAmount(minBRAmount);
        
        return minBRAmount;
      } else {
        setBrAmount('');
        return '0';
      }
      
    } catch (error) {
      console.error('计算最小BR数量失败:', error);
      setBrAmount('');
      return '0';
    } finally {
      setIsLoadingPrice(false);
    }
  };

  // 带防抖的价格查询函数
  const debouncedCalculateMinBRAmount = (usdtAmountInput) => {
    // 清除之前的定时器
    if (priceQueryTimer) {
      clearTimeout(priceQueryTimer);
    }
    
    // 设置新的定时器，500ms后执行
    const newTimer = setTimeout(() => {
      calculateMinBRAmount(usdtAmountInput);
    }, 500);
    
    setPriceQueryTimer(newTimer);
  };

  // V3 反向查询价格：从BR数量计算USDT数量
  const getUsdtAmountFromBr = async (brAmountInput) => {
    if (!brAmountInput || !provider || parseFloat(brAmountInput) <= 0) {
      return '0';
    }
    
    try {
      console.log('=== 使用PancakeSwap V3反向查询价格 ===');
      console.log('输入BR数量:', brAmountInput);
      console.log('V3Pool地址:', V3_POOL_ADDRESS);
      
      // 调用 slot0() 获取当前价格
      const slot0Result = await provider.call({
        to: V3_POOL_ADDRESS,
        data: '0x3850c7bd' // slot0() 方法ID
      });
      
      console.log('slot0 原始结果:', slot0Result);
      
      // 解析 slot0 结果，获取 sqrtPriceX96 (前64位)
      const sqrtPriceX96Hex = '0x' + slot0Result.slice(2, 66);
      const sqrtPriceX96 = ethers.getBigInt(sqrtPriceX96Hex);
      
      console.log('sqrtPriceX96:', sqrtPriceX96.toString());
      
      // 计算实际价格 - 保持精度
      // 转换为浮点数进行精确计算
      const Q96 = ethers.getBigInt('79228162514264337593543950336');
      const sqrtPriceNumber = Number(sqrtPriceX96.toString()) / Number(Q96.toString());
      const price = sqrtPriceNumber * sqrtPriceNumber;
      
      console.log('计算出的价格 (price):', price);
      
      // 将BR数量转换为浮点数
      const brAmountFloat = parseFloat(brAmountInput);
      console.log('BR数量(float):', brAmountFloat);
      
      // 计算输出的USDT数量
      // 对于 BR -> USDT，需要使用价格的倒数
      let usdtOutput;
      
      if (price > 0.001 && price < 1000) {
        // 如果价格在合理范围内，使用倒数计算BR->USDT
        usdtOutput = (brAmountFloat / price).toString();
      } else if (price > 1000) {
        // 如果价格太高，直接使用
        usdtOutput = (brAmountFloat * price).toString();
      } else {
        // 如果价格太低，直接使用
        usdtOutput = (brAmountFloat * price).toString();
      }
      
      console.log('计算出的USDT数量:', usdtOutput);
      
      // 验证结果
      const usdtOutputFloat = parseFloat(usdtOutput);
      if (usdtOutputFloat <= 0 || isNaN(usdtOutputFloat)) {
        console.error('❌ 计算结果无效:', usdtOutput);
        return '0';
      }
      
      console.log('✅ V3 反向价格查询成功');
      console.log('BR -> USDT 汇率:', (usdtOutputFloat / brAmountFloat).toFixed(8));
      
      return usdtOutputFloat.toFixed(8);
      
    } catch (error) {
      console.error('❌ V3 反向价格查询失败:', error);
      return '0';
    }
  };

  // 计算最小USDT数量（99.985%滑点保护）
  const calculateMinUSDTAmount = async (brAmountInput) => {
    if (!brAmountInput || parseFloat(brAmountInput) <= 0) {
      return '0';
    }
    
    try {
      console.log('=== 计算最小USDT数量 (使用V3) ===');
      
      // 查询可以得到的USDT数量
      const expectedUSDTAmount = await getUsdtAmountFromBr(brAmountInput);
      console.log('V3预期USDT数量:', expectedUSDTAmount);
      
      if (parseFloat(expectedUSDTAmount) > 0) {
        // 计算99.985%的数量（0.015%滑点）
        const minUSDTAmount = (parseFloat(expectedUSDTAmount) * 0.99985).toFixed(8);
        console.log('最小USDT数量(99.985%):', minUSDTAmount);
        
        return minUSDTAmount;
      } else {
        return '0';
      }
      
    } catch (error) {
      console.error('计算最小USDT数量失败:', error);
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
      setIsLoadingBalance(true);
      console.log('=== 获取BR代币余额 ===');
      console.log('用户地址:', account);
      console.log('BR代币地址:', BR_ADDRESS);
      
      // 构建balanceOf调用数据
      // balanceOf(address) 方法ID: 0x70a08231
      const balanceOfData = '0x70a08231' + account.slice(2).padStart(64, '0');
      console.log('balanceOf调用数据:', balanceOfData);
      
      // 调用合约获取余额
      const result = await provider.call({
        to: BR_ADDRESS,
        data: balanceOfData
      });
      
      console.log('余额调用结果(hex):', result);
      
      // 将结果转换为可读的数量
      const balanceInEther = ethers.formatEther(result);
      
      console.log('BR余额(hex):', result);
      console.log('BR余额(ether):', balanceInEther);
      
      // 更新state
      setBrBalance(balanceInEther);
      
      return balanceInEther;
      
    } catch (error) {
      console.error('获取BR余额失败:', error);
      setBrBalance('0');
      return '0';
    } finally {
      setIsLoadingBalance(false);
    }
  };

  // 获取USDT代币余额
  const getUSDTBalance = async () => {
    if (!account || !provider) {
      setUsdtBalance('0');
      return '0';
    }
    
    try {
      console.log('=== 获取USDT代币余额 ===');
      console.log('用户地址:', account);
      console.log('USDT代币地址:', USDT_ADDRESS);
      
      // 构建balanceOf调用数据
      // balanceOf(address) 方法ID: 0x70a08231
      const balanceOfData = '0x70a08231' + account.slice(2).padStart(64, '0');
      console.log('balanceOf调用数据:', balanceOfData);
      
      // 调用合约获取余额
      const result = await provider.call({
        to: USDT_ADDRESS,
        data: balanceOfData
      });
      
      console.log('USDT余额调用结果(hex):', result);
      
      // 将结果转换为可读的数量
      const balanceInEther = ethers.formatEther(result);
      
      console.log('USDT余额(hex):', result);
      console.log('USDT余额(ether):', balanceInEther);
      
      // 更新state
      setUsdtBalance(balanceInEther);
      
      return balanceInEther;
      
    } catch (error) {
      console.error('获取USDT余额失败:', error);
      setUsdtBalance('0');
      return '0';
    }
  };

  // 刷新所有代币余额
  const refreshAllBalances = async () => {
    try {
      const results = await Promise.all([getBRBalance(), getUSDTBalance()]);
      setLastBalanceUpdate(new Date());
      return results;
    } catch (error) {
      console.error('刷新余额失败:', error);
      return ['0', '0'];
    }
  };
  
  // 测试合约基本信息
  const testContractInfo = async () => {
    if (!provider) return;
    
    console.log('=== 合约测试 ===');
    try {
      // 检查合约代码
      const code = await provider.getCode(CONTRACT_ADDRESS);
      console.log('合约代码存在:', code !== '0x');
      console.log('合约代码长度:', code.length);
      
      // 检查网络
      const network = await provider.getNetwork();
      console.log('当前网络:', network);
      
      // 简单的合约调用测试（如果有public view方法）
      console.log('合约地址有效:', ethers.isAddress(CONTRACT_ADDRESS));
            
    } catch (error) {
      console.error('合约测试失败:', error);
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

  // 构建交易数据
  const buildTransactionData = (isUsdtToBr = true) => {
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
    
    // 验证方法ID
    console.log('=== 方法ID验证 ===');
    console.log('使用的方法ID:', methodId);
    console.log('方法ID长度:', methodId.length);
    console.log('方法ID格式正确:', methodId.startsWith('0x') && methodId.length === 10);
    
    // 常见方法ID参考（你可以根据实际合约ABI验证）
    // swapExactTokensForTokens: 0x38ed1739
    // swapTokensForExactTokens: 0x8803dbee
    // 当前使用的ID: 0xe5e8894b (需要确认这是正确的方法)
    
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
      // BR -> USDT 交易参数 (复制USDT->BR的参数作为模板，你可以修改)
      params = [
        '0000000000000000000000005efc784d444126ecc05f22c49ff3fbd7d9f4868a', // 参数0
        '000000000000000000000000ff7d6a96ae471bbcd7713af9cb1feeb16cf56b41', // 参数1
        brAmountHex, // 参数2: USDT数量
        '00000000000000000000000055d398326f99059ff775485246999027b3197955', // 参数3
        usdtAmountHex, // 参数4: BR数量
        '00000000000000000000000000000000000000000000000000000000000000c0', // 参数5
        '0000000000000000000000000000000000000000000000000000000000000404', // 参数6
        '9aa9035600000000000000000000000000000000000000000000000000000000', // 参数7
        '00000000000000000000000000000000ff7d6a96ae471bbcd7713af9cb1feeb1', // 参数8
        '6cf56b4100000000000000000000000055d398326f99059ff775485246999027', // 参数9
        'b3197955' + usdtPart1, // 参数10: 前4字节固定 + 后28字节BR数量
        usdtPart2 + timestampPart1, // 参数11: 前4字节BR数量 + 后28字节时间戳
        timestampPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数12: 前4字节时间戳 + 后28字节固定
        '0000010000000000000000000000000000000000000000000000000000000000', // 参数13
        '0000014000000000000000000000000000000000000000000000000000000000', // 参数14
        '0000000000000000000000000000000000000000000000000000000000000000', // 参数15
        '00000001' + brPart1, // 参数16: 前4字节固定 + 后28字节USDT数量
        brPart2 + '00000000000000000000000000000000000000000000000000000000', // 参数17: 前4字节USDT数量 + 后28字节固定
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
    
    console.log('=== 交易类型 ===');
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

  // 执行合约交易（使用指定的数量）
  const executeTransactionWithAmounts = async (isUsdtToBr = true, usdtAmountToUse = null, brAmountToUse = null) => {
    // 临时保存原始值
    const originalUsdtAmount = usdtAmount;
    const originalBrAmount = brAmount;
    
    // 如果提供了特定的数量，临时更新state
    if (usdtAmountToUse !== null) {
      setUsdtAmount(usdtAmountToUse);
    }
    if (brAmountToUse !== null) {
      setBrAmount(brAmountToUse);
    }
    
    console.log('=== 交易数量参数 ===');
    console.log('使用的USDT数量:', usdtAmountToUse || originalUsdtAmount);
    console.log('使用的BR数量:', brAmountToUse || originalBrAmount);
    
    // 等待state更新后执行交易
    setTimeout(async () => {
      await executeTransaction(isUsdtToBr);
    }, 100);
  };

  // 执行合约交易
  const executeTransaction = async (isUsdtToBr = true) => {
    if (!account || !provider) {
      alert('请先连接钱包！');
      return;
    }

    if (!usdtAmount || parseFloat(usdtAmount) <= 0) {
      alert('请输入有效的USDT数量！');
      return;
    }

    if (!brAmount || parseFloat(brAmount) <= 0) {
      alert('请输入有效的BR数量！');
      return;
    }

    try {
      setIsTrading(true);
      setTradeType(isUsdtToBr ? 'usdt-to-br' : 'br-to-usdt');

      console.log('开始执行交易...');
      console.log('合约地址:', CONTRACT_ADDRESS);
      console.log('交易类型:', isUsdtToBr ? 'USDT->BR' : 'BR->USDT');
      console.log('USDT数量:', usdtAmount);
      console.log('BR数量:', brAmount);

      // 获取signer
      const signer = await provider.getSigner();

      // 测试合约基本信息
      await testContractInfo();

      // 构建交易数据
      const data = buildTransactionData(isUsdtToBr);
      console.log('交易数据:', data);

            // 基础检查信息
      console.log('=== 交易准备信息 ===');
      console.log('发送方地址:', account);
      console.log('合约地址:', CONTRACT_ADDRESS);
      console.log('交易数据长度:', data.length);
      console.log('交易数据前100字符:', data.substring(0, 100));
      console.log('当前网络ID:', chainId);
      
      // 检查账户余额
      try {
        const balance = await provider.getBalance(account);
        console.log('账户余额:', ethers.formatEther(balance), 'ETH/BNB');
      } catch (balanceError) {
        console.error('获取余额失败:', balanceError);
      }

      // 检查合约是否存在
      try {
        const contractCode = await provider.getCode(CONTRACT_ADDRESS);
        console.log('合约代码长度:', contractCode.length);
        if (contractCode === '0x') {
          console.error('⚠️ 合约地址无效或合约不存在！');
          throw new Error('合约地址无效或合约不存在');
        }
      } catch (codeError) {
        console.error('检查合约代码失败:', codeError);
      }

      // 尝试估算Gas费用
      let gasEstimate;
      try {
        console.log('开始估算Gas费用...');
        
        // 构建用于Gas估算的完整交易对象
        const gasEstimateParams = {
          to: CONTRACT_ADDRESS,
          data: data,
          from: account,
          value: '0x0' // 明确设置value为0，与实际交易保持一致
        };
        
        console.log('=== Gas估算参数 ===');
        console.log('to:', gasEstimateParams.to);
        console.log('from:', gasEstimateParams.from);
        console.log('value:', gasEstimateParams.value);
        console.log('data 长度:', gasEstimateParams.data.length);
        console.log('data 前100字符:', gasEstimateParams.data.substring(0, 100));
        
        gasEstimate = await provider.estimateGas(gasEstimateParams);
        console.log('✅ Gas估算成功:', gasEstimate.toString());
      } catch (gasError) {
        console.error('❌ Gas估算失败，详细错误信息:');
        console.error('错误代码:', gasError.code);
        console.error('错误消息:', gasError.message);
        console.error('错误原因:', gasError.reason);
        console.error('错误数据:', gasError.data);
        console.error('完整错误对象:', gasError);
        
        // 尝试解析具体的失败原因
        let detailedError = 'Gas估算失败';
        if (gasError.reason) {
          detailedError = `合约执行失败: ${gasError.reason}`;
        } else if (gasError.message.includes('insufficient funds')) {
          detailedError = '余额不足，无法支付Gas费用';
        } else if (gasError.message.includes('execution reverted')) {
          detailedError = '合约执行被回滚，可能是业务逻辑错误';
        } else if (gasError.message.includes('invalid opcode')) {
          detailedError = '合约调用数据格式错误';
        } else if (gasError.message.includes('out of gas')) {
          detailedError = 'Gas限制不足';
        }
        
        // Gas估算失败时，使用固定的Gas Limit作为备用
        console.log('Gas估算失败，使用固定Gas Limit: 330000');
        gasEstimate = 330000;
        alert(`Gas估算失败: ${detailedError}\n将使用固定Gas Limit: 330000 继续执行`);
      }

      // 获取当前Gas价格
      let gasPrice;
      try {
        gasPrice = await provider.getFeeData();
        console.log('当前Gas费用数据:', gasPrice);
      } catch (gasPriceError) {
        console.error('获取Gas价格失败:', gasPriceError);
      }

      // 构建完整的交易对象
      const transaction = {
        to: CONTRACT_ADDRESS,
        data: data,
        gasLimit: gasEstimate,
        value: '0x0', // 我们不发送任何BNB，设置为0
      };

      // 如果网络支持EIP-1559，使用maxFeePerGas和maxPriorityFeePerGas
      if (gasPrice && gasPrice.maxFeePerGas) {
        transaction.maxFeePerGas = gasPrice.maxFeePerGas;
        transaction.maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas;
        transaction.type = 2; // EIP-1559 transaction type
      } else if (gasPrice && gasPrice.gasPrice) {
        transaction.gasPrice = gasPrice.gasPrice;
        transaction.type = 0; // Legacy transaction type
      }

      console.log('=== 完整交易对象 ===');
      console.log('to:', transaction.to);
      console.log('data:', transaction.data);
      console.log('gasLimit:', transaction.gasLimit);
      console.log('value:', transaction.value);
      console.log('type:', transaction.type);
      console.log('gasPrice:', transaction.gasPrice);
      console.log('maxFeePerGas:', transaction.maxFeePerGas);
      console.log('maxPriorityFeePerGas:', transaction.maxPriorityFeePerGas);
      console.log('data 长度:', transaction.data.length);
      console.log('交易对象:', transaction);

      // 验证交易对象完整性
      console.log('=== 交易对象验证 ===');
      console.log('to 地址是否有效:', ethers.isAddress(transaction.to));
      console.log('data 是否以0x开头:', transaction.data.startsWith('0x'));
      console.log('gasLimit 是否为数字:', typeof transaction.gasLimit);
      console.log('value 是否为字符串:', typeof transaction.value);
      
      // 如果交易对象有问题，提前报错
      if (!ethers.isAddress(transaction.to)) {
        throw new Error('无效的合约地址');
      }
      if (!transaction.data.startsWith('0x')) {
        throw new Error('无效的交易数据格式');
      }
      
      // 发送交易
      console.log('发送交易...');
      console.log('使用signer发送交易，signer地址:', await signer.getAddress());
      const txResponse = await signer.sendTransaction(transaction);
      
      console.log('交易已发送，Hash:', txResponse.hash);
      alert(`交易已发送！\n交易Hash: ${txResponse.hash}\nUSDT: ${usdtAmount}\nBR: ${brAmount}\n请等待区块确认...`);

      // 等待交易确认
      console.log('等待交易确认...');
      const receipt = await txResponse.wait();
      
      console.log('交易已确认:', receipt);
      alert(`交易成功！\n交易Hash: ${receipt.transactionHash}\n区块号: ${receipt.blockNumber}\nUSDT: ${usdtAmount}\nBR: ${brAmount}`);

      // 交易完成后立即刷新代币余额
      console.log('交易完成，刷新代币余额...');
      await refreshAllBalances();

    } catch (error) {
      console.error('交易失败:', error);
      
      let errorMessage = '交易失败！';
      if (error.code === 4001) {
        errorMessage = '用户取消了交易';
      } else if (error.code === -32603) {
        errorMessage = '交易执行失败，可能是余额不足或合约错误';
      } else if (error.message) {
        errorMessage = `交易失败: ${error.message}`;
      }
      
      alert(errorMessage);
    } finally {
      setIsTrading(false);
      setTradeType('');
    }
  };

  // 处理USDT->BR交易
  const handleUsdtToBr = async () => {
    if (!usdtAmount || parseFloat(usdtAmount) <= 0) {
      alert('请输入有效的USDT数量！');
      return;
    }
    
    // 交易前先刷新代币余额
    console.log('=== 购买BR - 刷新余额 ===');
    await refreshAllBalances();
    
    console.log('=== 购买BR - 最终价格确认 ===');
    
    // 执行前再次计算最小BR数量，确保价格准确
    const finalMinBRAmount = await calculateMinBRAmount(usdtAmount);
    
    if (!finalMinBRAmount || parseFloat(finalMinBRAmount) <= 0) {
      alert('无法获取BR价格，请稍后重试！');
      return;
    }
    
    // 检查USDT余额是否足够
    if (parseFloat(usdtBalance) < parseFloat(usdtAmount)) {
      alert(`USDT余额不足！\n需要: ${parseFloat(usdtAmount).toFixed(6)} USDT\n当前: ${parseFloat(usdtBalance).toFixed(6)} USDT`);
      return;
    }
    
    // 确认交易信息
    const confirmMessage = `确认购买BR代币:\n` +
      `支付: ${parseFloat(usdtAmount).toFixed(6)} USDT\n` +
      `最小接收: ${parseFloat(finalMinBRAmount).toFixed(8)} BR\n` +
      `当前USDT余额: ${parseFloat(usdtBalance).toFixed(6)} USDT\n` +
      `滑点保护: 0.015%\n` +
      `是否确认继续？`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    await executeTransaction(true);
  };

  // 处理BR->USDT交易
  const handleBrToUsdt = async () => {
    // 出售BR时，自动获取用户的代币余额
    console.log('=== 出售BR - 获取余额 ===');
    const [currentBrBalance, currentUsdtBalance] = await refreshAllBalances();
    console.log('用户BR余额:', currentBrBalance);
    console.log('用户USDT余额:', currentUsdtBalance);
    
    if (parseFloat(currentBrBalance) <= 0) {
      alert(`您的BR余额不足，无法进行出售！\n当前BR余额: ${parseFloat(currentBrBalance).toFixed(6)} BR`);
      return;
    }
    
    // 自动设置BR数量为用户的全部余额
    setBrAmount(currentBrBalance);
    console.log('自动设置BR数量为:', currentBrBalance);
    
    // 查询价格并计算最小USDT数量
    console.log('=== 查询价格并计算最小USDT数量 ===');
    try {
      const minUsdtAmount = await calculateMinUSDTAmount(currentBrBalance);
      console.log('计算得到的最小USDT数量:', minUsdtAmount);
      
      if (parseFloat(minUsdtAmount) <= 0) {
        alert('价格查询失败，无法计算预期收益。请稍后重试。');
        return;
      }
      
      // 自动设置USDT数量为计算得到的最小值（已包含滑点保护）
      setUsdtAmount(minUsdtAmount);
      console.log('自动设置USDT数量为:', minUsdtAmount);
      
      // 显示更详细的确认信息
      const expectedUsdtAmount = await getUsdtAmountFromBr(currentBrBalance);
      const rate = parseFloat(expectedUsdtAmount) / parseFloat(currentBrBalance);
      
      const confirmMessage = 
        `您将出售全部BR代币:\n` +
        `出售数量: ${parseFloat(currentBrBalance).toFixed(6)} BR\n` +
        `预期收益: ${parseFloat(expectedUsdtAmount).toFixed(6)} USDT\n` +
        `最小收益: ${parseFloat(minUsdtAmount).toFixed(6)} USDT\n` +
        `当前USDT余额: ${parseFloat(currentUsdtBalance).toFixed(6)} USDT\n` +
        `交易后USDT余额: ${(parseFloat(currentUsdtBalance) + parseFloat(minUsdtAmount)).toFixed(6)} USDT\n` +
        `当前汇率: 1 BR ≈ ${rate.toFixed(8)} USDT\n` +
        `滑点保护: 0.015%\n` +
        `是否确认继续？`;
      
      if (!window.confirm(confirmMessage)) {
        return;
      }
      
      // 使用计算得到的USDT最小值执行交易
      await executeTransactionWithAmounts(false, minUsdtAmount, currentBrBalance);
      
    } catch (error) {
      console.error('出售BR流程失败:', error);
      alert('出售BR流程失败，请稍后重试。');
    }
  };

  return (
    <div className="fixed-trade">
      <h2>🔄 固定交易</h2>
      <p className="trade-description">
        快速执行预设的交易对，一键完成代币兑换
      </p>

      {!account ? (
        <div className="no-wallet">
          <h3>⚠️ 请先连接钱包</h3>
          <p>需要连接钱包才能进行交易操作</p>
        </div>
      ) : (
        <div className="trade-buttons-container">
                      <div className="trade-pair-section">
            <h3>💰 USDT ↔ BR 交易对</h3>
            <p className="contract-info">
              合约地址: {CONTRACT_ADDRESS}
            </p>
            
            {/* USDT数量输入 */}
            <div className="amount-input-section">
              <label htmlFor="usdt-amount">USDT 数量:</label>
              <input
                id="usdt-amount"
                type="number"
                value={usdtAmount}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setUsdtAmount(newValue);
                  // 购买BR时自动计算最小BR数量（使用防抖）
                  if (newValue && parseFloat(newValue) > 0) {
                    debouncedCalculateMinBRAmount(newValue);
                  } else {
                    setBrAmount('');
                    // 清除防抖定时器
                    if (priceQueryTimer) {
                      clearTimeout(priceQueryTimer);
                      setPriceQueryTimer(null);
                    }
                  }
                }}
                placeholder="请输入USDT数量"
                step="0.000001"
                min="0"
                disabled={isTrading}
                className={`amount-input ${
                  usdtAmount && parseFloat(usdtAmount) > parseFloat(usdtBalance) ? 'insufficient-balance' : ''
                }`}
              />
              <span className="input-hint">
                {usdtAmount ? `≈ ${parseFloat(usdtAmount).toFixed(6)} USDT` : '请输入交易数量'}
              </span>
              {usdtAmount && parseFloat(usdtAmount) > parseFloat(usdtBalance) && (
                <span className="insufficient-balance-hint">
                  ⚠️ 余额不足！需要 {parseFloat(usdtAmount).toFixed(6)} USDT，当前仅有 {parseFloat(usdtBalance).toFixed(6)} USDT
                </span>
              )}
              <div className="balance-info">
                <span className="balance-label">当前USDT余额:</span>
                <span className="balance-value">
                  {isLoadingBalance ? '🔄 加载中...' : `${parseFloat(usdtBalance).toFixed(6)} USDT`}
                </span>
                <button 
                  className="refresh-balance-button"
                  onClick={() => {
                    console.log('手动刷新USDT余额...');
                    getUSDTBalance();
                  }}
                  disabled={isTrading || isLoadingBalance}
                  title="刷新USDT余额"
                >
                  {isLoadingBalance ? '⏳' : '🔄'}
                </button>
                <button 
                  className="use-max-button"
                  onClick={() => {
                    // 保留一小部分USDT作为Gas费预留
                    const maxUsableUsdt = Math.max(0, parseFloat(usdtBalance) - 0.001);
                    if (maxUsableUsdt > 0) {
                      setUsdtAmount(maxUsableUsdt.toFixed(6));
                      // 触发价格查询
                      debouncedCalculateMinBRAmount(maxUsableUsdt.toFixed(6));
                    }
                  }}
                  disabled={isTrading || parseFloat(usdtBalance) <= 0.001 || isLoadingBalance}
                >
                  使用全部
                </button>
              </div>
            </div>

            {/* BR数量输入 */}
            <div className="amount-input-section">
              <label htmlFor="br-amount">BR 数量 (最小接收数量):</label>
              <input
                id="br-amount"
                type="number"
                value={brAmount}
                onChange={(e) => setBrAmount(e.target.value)}
                placeholder="自动计算的最小数量"
                step="0.000001"
                min="0"
                disabled={isTrading}
                className="amount-input"
              />
              <span className="input-hint">
                {isLoadingPrice ? '🔄 正在查询价格...' : 
                 brAmount ? `≈ ${parseFloat(brAmount).toFixed(8)} BR (99.985%滑点保护)` : '根据USDT数量自动计算'}
              </span>
              <div className="balance-info">
                <span className="balance-label">当前BR余额:</span>
                <span className="balance-value">
                  {isLoadingBalance ? '🔄 加载中...' : `${parseFloat(brBalance).toFixed(6)} BR`}
                </span>
                <button 
                  className="refresh-balance-button"
                  onClick={() => {
                    console.log('手动刷新代币余额...');
                    refreshAllBalances();
                  }}
                  disabled={isTrading || isLoadingBalance}
                  title="刷新BR余额"
                >
                  {isLoadingBalance ? '⏳' : '🔄'}
                </button>
                <button 
                  className="use-max-button"
                  onClick={() => setBrAmount(brBalance)}
                  disabled={isTrading || parseFloat(brBalance) <= 0 || isLoadingBalance}
                >
                  使用全部
                </button>
              </div>
              {lastBalanceUpdate && (
                <div className="balance-update-time">
                  最后更新: {lastBalanceUpdate.toLocaleTimeString()}
                </div>
              )}
            </div>
            
            <div className="trade-buttons">
              {/* USDT->BR 按钮 */}
              <button
                className={`trade-button usdt-to-br ${tradeType === 'usdt-to-br' ? 'trading' : ''} ${isLoadingPrice ? 'price-loading' : ''}`}
                onClick={handleUsdtToBr}
                disabled={isTrading || isLoadingPrice || (usdtAmount && parseFloat(usdtAmount) > parseFloat(usdtBalance))}
              >
                <div className="button-content">
                  <div className="trade-direction">
                    <span className="from-token">USDT</span>
                    <span className="arrow">→</span>
                    <span className="to-token">BR</span>
                  </div>
                  <div className="button-text">
                    {isTrading && tradeType === 'usdt-to-br' ? '交易中...' : 
                     isLoadingPrice ? '查询价格中...' : 
                     (usdtAmount && parseFloat(usdtAmount) > parseFloat(usdtBalance)) ? 'USDT余额不足' : '购买 BR'}
                  </div>
                  <div className="trade-info">
                    使用 USDT 购买 BR 代币
                    {usdtAmount && brAmount && !isLoadingPrice && (
                      <div className="price-info">
                        汇率: 1 USDT ≈ {(parseFloat(brAmount) / parseFloat(usdtAmount)).toFixed(8)} BR
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {/* BR->USDT 按钮 */}
              <button
                className={`trade-button br-to-usdt ${tradeType === 'br-to-usdt' ? 'trading' : ''}`}
                onClick={handleBrToUsdt}
                disabled={isTrading || isLoadingBalance}
              >
                <div className="button-content">
                  <div className="trade-direction">
                    <span className="from-token">BR</span>
                    <span className="arrow">→</span>
                    <span className="to-token">USDT</span>
                  </div>
                  <div className="button-text">
                    {isTrading && tradeType === 'br-to-usdt' ? '交易中...' : 
                     isLoadingBalance ? '获取余额中...' : '出售 BR'}
                  </div>
                  <div className="trade-info">
                    将 BR 代币兑换为 USDT
                  </div>
                  <div className="balance-display">
                    当前余额: {isLoadingBalance ? '🔄 加载中...' : `${parseFloat(brBalance).toFixed(6)} BR`}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 交易信息 */}
          <div className="trade-info-section">
            <h3>📊 交易信息</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">当前网络:</span>
                <span className="value">
                  {chainId === '56' ? 'BSC 主网' : chainId === '97' ? 'BSC 测试网' : '其他网络'}
                </span>
              </div>
              <div className="info-item">
                <span className="label">钱包地址:</span>
                <span className="value">
                  {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : '未连接'}
                </span>
              </div>
              <div className="info-item">
                <span className="label">交易状态:</span>
                <span className="value">
                  {isTrading ? '交易进行中' : '准备就绪'}
                </span>
              </div>
              <div className="info-item">
                <span className="label">USDT余额:</span>
                <span className="value">
                  {isLoadingBalance ? '🔄 加载中...' : `${parseFloat(usdtBalance).toFixed(6)} USDT`}
                </span>
              </div>
              <div className="info-item">
                <span className="label">余额刷新:</span>
                <span className="value">
                  {lastBalanceUpdate ? 
                    `${lastBalanceUpdate.toLocaleTimeString()} (自动每60秒)` : 
                    '暂未更新'
                  }
                </span>
              </div>
              <div className="info-item">
                <span className="label">合约地址:</span>
                <span className="value">
                  {`${CONTRACT_ADDRESS.slice(0, 6)}...${CONTRACT_ADDRESS.slice(-4)}`}
                </span>
              </div>
            </div>
          </div>

          {/* 注意事项 */}
          <div className="notice-section">
            <h3>⚠️ 注意事项</h3>
            <ul>
              <li>请确保钱包中有足够的代币余额和BNB作为Gas费</li>
              <li>交易前请确认网络费用(Gas费)和滑点设置</li>
              <li>建议在BSC主网进行交易</li>
              <li>交易完成后请检查代币余额变化</li>
              <li>大额交易建议分批进行以降低风险</li>
              <li>USDT和BR余额每60秒自动刷新，可点击🔄按钮手动刷新</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default FixedTrade; 