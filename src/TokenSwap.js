import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './TokenSwap.css';

const TokenSwap = ({ account, provider, chainId }) => {
  const [tokens, setTokens] = useState([]);
  const [fromToken, setFromToken] = useState('');
  const [toToken, setToToken] = useState('');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [isSwapping, setIsSwapping] = useState(false);
  const [fromTokenBalance, setFromTokenBalance] = useState('0');
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // ERC20 代币 ABI（简化版，只包含需要的方法）
  const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];

  // 从localStorage加载已配置的币种
  useEffect(() => {
    const savedTokens = localStorage.getItem('configuredTokens');
    if (savedTokens) {
      setTokens(JSON.parse(savedTokens));
    }
  }, []);

  // 获取代币余额
  const getTokenBalance = async (tokenName, userAddress) => {
    if (!provider || !userAddress) return '0';

    try {
      const token = tokens.find(t => t.name === tokenName);
      if (!token) return '0';

      // 检查是否是原生代币 (ETH, BNB等)
      const nativeTokens = ['ETH', 'BNB', 'MATIC', 'AVAX'];
      const isNativeToken = nativeTokens.includes(tokenName) || token.address === '0x0000000000000000000000000000000000000000';

      if (isNativeToken) {
        // 获取原生代币余额
        const balance = await provider.getBalance(userAddress);
        return ethers.formatEther(balance);
      } else {
        // 获取ERC20代币余额
        const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
        const balance = await contract.balanceOf(userAddress);
        const decimals = await contract.decimals();
        return ethers.formatUnits(balance, decimals);
      }
    } catch (error) {
      console.error(`获取${tokenName}余额失败:`, error);
      return '0';
    }
  };

  // 更新源币种余额
  useEffect(() => {
    const updateFromTokenBalance = async () => {
      if (fromToken && account) {
        setIsLoadingBalance(true);
        try {
          const balance = await getTokenBalance(fromToken, account);
          setFromTokenBalance(balance);
        } catch (error) {
          console.error('更新余额失败:', error);
          setFromTokenBalance('0');
        } finally {
          setIsLoadingBalance(false);
        }
      } else {
        setFromTokenBalance('0');
      }
    };

    updateFromTokenBalance();
  }, [fromToken, account, provider, tokens]);

  // 选择代币
  const selectFromToken = (tokenName) => {
    setFromToken(tokenName);
    // 如果选择的是同一个币种，清空目标币种
    if (tokenName === toToken) {
      setToToken('');
    }
    // 清空数量
    setFromAmount('');
    setToAmount('');
  };

  const selectToToken = (tokenName) => {
    setToToken(tokenName);
    // 如果选择的是同一个币种，清空源币种
    if (tokenName === fromToken) {
      setFromToken('');
    }
  };

  // 交换源币种和目标币种
  const swapTokens = () => {
    const tempToken = fromToken;
    const tempAmount = fromAmount;
    
    setFromToken(toToken);
    setToToken(tempToken);
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  // 处理数量输入
  const handleAmountChange = (value, isFrom = true) => {
    // 只允许输入数字和小数点
    const numericValue = value.replace(/[^0-9.]/g, '');
    
    if (isFrom) {
      setFromAmount(numericValue);
      // 这里可以添加汇率计算逻辑
      // 目前只是简单的1:1显示
      setToAmount(numericValue);
    } else {
      setToAmount(numericValue);
      setFromAmount(numericValue);
    }
  };

  // 设置最大金额
  const setMaxAmount = () => {
    if (fromTokenBalance && parseFloat(fromTokenBalance) > 0) {
      const maxBalance = parseFloat(fromTokenBalance).toString();
      setFromAmount(maxBalance);
      setToAmount(maxBalance); // 1:1兑换率
    }
  };

  // 获取可用的币种列表（排除已选择的）
  const getAvailableTokens = (excludeToken) => {
    return tokens.filter(token => token.name !== excludeToken);
  };

  // 模拟兑换操作
  const handleSwap = async () => {
    if (!fromToken || !toToken || !fromAmount) {
      alert('请选择币种并输入兑换数量！');
      return;
    }

    if (parseFloat(fromAmount) <= 0) {
      alert('请输入有效的兑换数量！');
      return;
    }

    // 检查余额是否足够
    if (parseFloat(fromAmount) > parseFloat(fromTokenBalance)) {
      alert('余额不足！请检查您的账户余额。');
      return;
    }

    setIsSwapping(true);
    
    // 模拟交易延迟
    setTimeout(() => {
      alert(`模拟兑换成功！\n${fromAmount} ${fromToken} → ${toAmount} ${toToken}`);
      setIsSwapping(false);
      // 清空输入
      setFromAmount('');
      setToAmount('');
    }, 2000);
  };

  // 格式化余额显示
  const formatBalance = (balance) => {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.0001) return '< 0.0001';
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <div className="token-swap">
      <h2>🔄 币种兑换</h2>
      <p className="swap-description">
        选择您要兑换的币种进行交易
      </p>

      {!account ? (
        <div className="no-wallet-message">
          <h3>⚠️ 请先连接钱包</h3>
          <p>需要连接钱包才能查看余额和进行兑换</p>
        </div>
      ) : tokens.length === 0 ? (
        <div className="no-tokens-message">
          <h3>⚠️ 没有可用的币种</h3>
          <p>请先在配置页面添加币种，然后再进行兑换操作</p>
        </div>
      ) : (
        <div className="swap-container">
          
          {/* 源币种选择 */}
          <div className="swap-section">
            <div className="section-header">
              <h3>从 (From)</h3>
              {fromToken && (
                <div className="balance-info">
                  <span className="balance-label">余额: </span>
                  {isLoadingBalance ? (
                    <span className="balance-loading">加载中...</span>
                  ) : (
                    <span className="balance-value" title={`${fromTokenBalance} ${fromToken}`}>
                      {formatBalance(fromTokenBalance)} {fromToken}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="token-input-container">
              <div className="amount-input-wrapper">
                <input
                  type="text"
                  placeholder="0.0"
                  value={fromAmount}
                  onChange={(e) => handleAmountChange(e.target.value, true)}
                  className="amount-input"
                />
              </div>
              <div className="token-selector-wrapper">
                {fromToken && parseFloat(fromTokenBalance) > 0 && (
                  <button 
                    className="max-button"
                    onClick={setMaxAmount}
                    title="使用所有余额"
                  >
                    MAX
                  </button>
                )}
                <div className="token-selector">
                  {fromToken ? (
                    <div className="selected-token" onClick={() => setFromToken('')}>
                      <span className="token-name">{fromToken}</span>
                      <span className="change-hint">点击更换</span>
                    </div>
                  ) : (
                    <div className="token-dropdown">
                      <div className="dropdown-header">选择币种</div>
                      <div className="dropdown-options">
                        {getAvailableTokens(toToken).map((token, index) => (
                          <div
                            key={index}
                            className="dropdown-option"
                            onClick={() => selectFromToken(token.name)}
                          >
                            {token.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 交换按钮 */}
          <div className="swap-arrow-container">
            <button 
              className="swap-arrow-button"
              onClick={swapTokens}
              disabled={!fromToken || !toToken}
              title="交换币种位置"
            >
              ⬇️
            </button>
          </div>

          {/* 目标币种选择 */}
          <div className="swap-section">
            <h3>到 (To)</h3>
            <div className="token-input-container">
              <div className="amount-input-wrapper">
                <input
                  type="text"
                  placeholder="0.0"
                  value={toAmount}
                  onChange={(e) => handleAmountChange(e.target.value, false)}
                  className="amount-input"
                />
              </div>
              <div className="token-selector">
                {toToken ? (
                  <div className="selected-token" onClick={() => setToToken('')}>
                    <span className="token-name">{toToken}</span>
                    <span className="change-hint">点击更换</span>
                  </div>
                ) : (
                  <div className="token-dropdown">
                    <div className="dropdown-header">选择币种</div>
                    <div className="dropdown-options">
                      {getAvailableTokens(fromToken).map((token, index) => (
                        <div
                          key={index}
                          className="dropdown-option"
                          onClick={() => selectToToken(token.name)}
                        >
                          {token.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 兑换信息 */}
          {fromToken && toToken && fromAmount && (
            <div className="swap-info">
              <div className="swap-rate">
                <span>汇率: 1 {fromToken} = 1 {toToken}</span>
                <span className="rate-note">(模拟汇率)</span>
              </div>
              {fromToken && parseFloat(fromAmount) > parseFloat(fromTokenBalance) && (
                <div className="insufficient-balance-warning">
                  ⚠️ 余额不足！当前余额: {formatBalance(fromTokenBalance)} {fromToken}
                </div>
              )}
            </div>
          )}

          {/* 兑换按钮 */}
          <button 
            className="swap-button"
            onClick={handleSwap}
            disabled={!fromToken || !toToken || !fromAmount || isSwapping || parseFloat(fromAmount) > parseFloat(fromTokenBalance)}
          >
            {isSwapping ? '兑换中...' : 
             parseFloat(fromAmount) > parseFloat(fromTokenBalance) ? '余额不足' : 
             '立即兑换'}
          </button>
        </div>
      )}

      {/* 快速选择区域 */}
      {tokens.length > 0 && account && (
        <div className="quick-select-section">
          <h3>🚀 快速选择</h3>
          <div className="quick-select-buttons">
            {tokens.map((token, index) => (
              <button
                key={index}
                className={`quick-select-button ${
                  fromToken === token.name || toToken === token.name ? 'selected' : ''
                }`}
                onClick={() => {
                  if (!fromToken) {
                    selectFromToken(token.name);
                  } else if (!toToken && fromToken !== token.name) {
                    selectToToken(token.name);
                  }
                }}
              >
                {token.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 使用说明 */}
      <div className="swap-tips">
        <h3>💡 使用说明</h3>
        <ul>
          <li>实时显示您的代币余额</li>
          <li>点击"MAX"按钮可快速填入所有余额</li>
          <li>目前为模拟兑换，实际兑换需要集成DEX协议</li>
          <li>汇率为模拟数据，实际使用时需要从DEX获取实时汇率</li>
          <li>交易前请确认网络和币种信息</li>
        </ul>
      </div>
    </div>
  );
};

export default TokenSwap; 