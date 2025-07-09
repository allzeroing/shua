import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import FixedTrade from './FixedTrade';
import CycleTrading from './CycleTrading';
import './App.css';

function App() {
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState(null);
  const [chainId, setChainId] = useState('');
  const [balance, setBalance] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const [currentPage, setCurrentPage] = useState('wallet'); // 'wallet', 'fixed', 'cycle'

  // 使用ref来跟踪当前连接状态，避免闭包问题
  const accountRef = useRef('');
  
  // 更新accountRef
  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  // BSC主网配置
  const BSC_MAINNET = {
    chainId: '56',
    name: 'BSC 主网',
    symbol: 'BNB',
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    blockExplorer: 'https://bscscan.com'
  };

  // 检查MetaMask是否安装
  const checkMetaMaskInstalled = () => {
    return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
  };

  // 更新余额
  const updateBalance = async (provider, address) => {
    try {
      const balance = await provider.getBalance(address);
      setBalance(ethers.formatEther(balance));
    } catch (error) {
      console.error('获取余额失败:', error);
      setBalance('0');
    }
  };

  // 连接钱包函数
  const connectWallet = async (retryCount = 0) => {
    if (!checkMetaMaskInstalled()) return;
    
    // 如果已经连接且不是重试，则不执行连接
    if (account && retryCount === 0) {
      console.log('钱包已连接，跳过连接请求');
      return;
    }
    
    setIsConnecting(true);
    
    try {
      console.log(`尝试连接钱包... (第${retryCount + 1}次)`);
      
      // 先检查是否已有连接的账户
      const existingAccounts = await window.ethereum.request({ 
        method: 'eth_accounts' 
      });
      
      let accounts;
      if (existingAccounts.length > 0) {
        // 如果已有账户，直接使用
        accounts = existingAccounts;
        console.log('使用已连接的账户:', accounts[0]);
      } else {
        // 没有账户时才请求连接
        accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
      }
      
      if (accounts.length === 0) {
        throw new Error('没有可用的账户');
      }

      // 创建provider
      const provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(provider);
      
      // 设置账户
      setAccount(accounts[0]);
      console.log('钱包连接成功:', accounts[0]);
      
      // 获取网络信息
      const network = await provider.getNetwork();
      const currentChainId = network.chainId.toString();
      setChainId(currentChainId);
      
      // 检查是否在BSC主网，如果不是则自动切换
      if (currentChainId !== BSC_MAINNET.chainId) {
        console.log('当前网络不是BSC主网，正在切换...');
        await switchToBSC();
      } else {
        // 更新余额
        await updateBalance(provider, accounts[0]);
      }
      
    } catch (error) {
      console.error('连接钱包失败:', error);
      
      // 根据错误类型决定是否重试
      const shouldRetry = retryCount < 2 && (
        error.code === -32002 || // 用户已有待处理请求
        error.code === -32603 || // 内部错误
        error.message.includes('MetaMask') ||
        error.message.includes('provider')
      );
      
      if (shouldRetry) {
        console.log(`连接失败，将在2秒后进行第${retryCount + 2}次重试...`);
        setTimeout(() => {
          connectWallet(retryCount + 1);
        }, 2000);
        return; // 不设置isConnecting为false，保持连接状态
      }
      
      // 用户拒绝连接或其他不可恢复的错误
      if (error.code === 4001) {
        alert('用户拒绝了连接请求');
      } else if (error.code === -32002) {
        alert('MetaMask中已有待处理的连接请求，请检查MetaMask');
      } else {
        alert(`连接失败: ${error.message}`);
      }
    } finally {
      // 只有在非重试情况下才设置连接状态
      if (retryCount >= 2 || !isConnecting) {
        setIsConnecting(false);
      }
    }
  };

  // 切换到BSC主网
  const switchToBSC = async () => {
    if (!checkMetaMaskInstalled() || !window.ethereum) {
      alert('请先安装并连接MetaMask钱包！');
      return;
    }

    try {
      setIsSwitchingNetwork(true);
      
      // 尝试切换到BSC主网
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x38' }] // BSC主网的十六进制ID
      });
      
      console.log('成功切换到BSC主网');
      setChainId(BSC_MAINNET.chainId);
      
      // 切换成功后更新余额
      if (account && provider) {
        await updateBalance(provider, account);
      }
      
    } catch (error) {
      console.error('切换到BSC主网失败:', error);
      
      // 如果BSC网络不存在，尝试添加
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x38',
              chainName: BSC_MAINNET.name,
              nativeCurrency: {
                name: BSC_MAINNET.symbol,
                symbol: BSC_MAINNET.symbol,
                decimals: 18
              },
              rpcUrls: [BSC_MAINNET.rpcUrl],
              blockExplorerUrls: [BSC_MAINNET.blockExplorer]
            }]
          });
          
          console.log('成功添加并切换到BSC主网');
          setChainId(BSC_MAINNET.chainId);
          
          // 切换成功后更新余额
          if (account && provider) {
            await updateBalance(provider, account);
          }
          
        } catch (addError) {
          console.error('添加BSC网络失败:', addError);
          alert(`添加BSC网络失败: ${addError.message}`);
        }
      } else if (error.code === 4001) {
        console.log('用户拒绝了切换到BSC主网的请求');
        alert('需要切换到BSC主网才能使用此应用');
      } else {
        alert(`切换到BSC主网失败: ${error.message}`);
      }
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  // 断开连接
  const disconnectWallet = () => {
    setAccount('');
    setProvider(null);
    setChainId('');
    setBalance('');
  };

  // 监听账户和网络变化
  useEffect(() => {
    if (checkMetaMaskInstalled()) {
      // 监听账户变化
      const handleAccountsChanged = async (accounts) => {
        console.log('账户变化:', accounts);
        if (accounts.length === 0) {
          console.log('钱包已断开连接');
          disconnectWallet();
        } else {
          console.log('检测到新账户，重新连接...');
          setAccount(accounts[0]);
          
          // 重新创建provider和更新余额
          try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            setProvider(provider);
            await updateBalance(provider, accounts[0]);
            
            // 获取并更新网络信息
            const network = await provider.getNetwork();
            const currentChainId = network.chainId.toString();
            setChainId(currentChainId);
            
            // 检查是否在BSC主网
            if (currentChainId !== BSC_MAINNET.chainId) {
              console.log('账户变化后检测到不在BSC主网');
              await switchToBSC();
            }
          } catch (error) {
            console.error('账户变化后重新连接失败:', error);
          }
        }
      };

              // 监听网络变化
        const handleChainChanged = async (chainId) => {
          console.log('网络变化:', chainId);
          const newChainId = parseInt(chainId, 16).toString();
          setChainId(newChainId);
          
          // 检查是否切换到了BSC主网
          if (newChainId !== BSC_MAINNET.chainId) {
            console.log('检测到网络不是BSC主网，将自动切换');
            alert('检测到网络变化，需要使用BSC主网才能正常使用此应用');
            await switchToBSC();
          } else {
            // 如果是BSC主网，更新余额
            if (account) {
              try {
                const provider = new ethers.BrowserProvider(window.ethereum);
                setProvider(provider);
                await updateBalance(provider, account);
              } catch (error) {
                console.error('网络切换后更新失败:', error);
              }
            }
          }
        };

      // 监听钱包断开连接
      const handleDisconnect = (error) => {
        console.log('钱包断开连接事件:', error);
        disconnectWallet();
      };

      // 添加监听器（不监听connect事件，避免重复连接）
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      window.ethereum.on('disconnect', handleDisconnect);

      // 初始连接检查 - 使用更安全的方式
      const initializeConnection = async () => {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            console.log('检测到已连接的钱包账户:', accounts[0]);
            
            // 直接设置状态，不调用connectWallet避免触发连接弹窗
            const provider = new ethers.BrowserProvider(window.ethereum);
            setProvider(provider);
            setAccount(accounts[0]);
            
            // 获取网络信息
            const network = await provider.getNetwork();
            const currentChainId = network.chainId.toString();
            setChainId(currentChainId);
            
            // 检查是否在BSC主网
            if (currentChainId !== BSC_MAINNET.chainId) {
              console.log('初始化时检测到不在BSC主网，准备切换');
              await switchToBSC();
            } else {
              // 更新余额
              await updateBalance(provider, accounts[0]);
            }
            
            console.log('钱包状态初始化完成');
          }
        } catch (error) {
          console.error('初始连接检查失败:', error);
        }
      };
      
      initializeConnection();

      // 定期检查连接状态（可选，用于处理异常断开的情况）
      const connectionCheck = setInterval(async () => {
        if (accountRef.current) {
          try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length === 0) {
              console.log('检测到钱包已断开，清理状态...');
              disconnectWallet();
              clearInterval(connectionCheck);
            }
          } catch (error) {
            console.error('连接状态检查失败:', error);
          }
        }
      }, 30000); // 每30秒检查一次

      // 清理监听器
      return () => {
        if (window.ethereum) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
          window.ethereum.removeListener('disconnect', handleDisconnect);
        }
        clearInterval(connectionCheck);
      };
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 获取当前网络信息（只支持BSC主网）
  const getCurrentNetwork = () => {
    if (chainId === BSC_MAINNET.chainId) {
      return BSC_MAINNET;
    }
    return { 
      name: `不支持的网络 (${chainId})`, 
      symbol: 'BNB',
      blockExplorer: BSC_MAINNET.blockExplorer
    };
  };

  // 格式化地址显示
  const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // 获取网络状态颜色
  const getNetworkStatusColor = () => {
    if (chainId === BSC_MAINNET.chainId) {
      return '#4caf50'; // 绿色 - BSC主网
    }
    return '#ff5722'; // 红色 - 不支持的网络
  };

  // 渲染导航菜单
  const renderNavigation = () => (
    <nav className="navigation">
      <div className="nav-brand">
        <h1>🌟 Alpha Shuafen DApp</h1>
      </div>
      <div className="nav-links">
        <button 
          className={`nav-button ${currentPage === 'wallet' ? 'active' : ''}`}
          onClick={() => setCurrentPage('wallet')}
        >
          🔗 钱包连接
        </button>
        <button 
          className={`nav-button ${currentPage === 'fixed' ? 'active' : ''}`}
          onClick={() => setCurrentPage('fixed')}
          disabled={!account}
          title={!account ? '请先连接钱包' : ''}
        >
          ⚡ 固定交易
        </button>
        <button 
          className={`nav-button ${currentPage === 'cycle' ? 'active' : ''}`}
          onClick={() => setCurrentPage('cycle')}
          disabled={!account}
          title={!account ? '请先连接钱包' : ''}
        >
          🔄 循环交易
        </button>
      </div>
      {account && (
        <div className="nav-wallet-info">
          <span className="wallet-address">{formatAddress(account)}</span>
          <span className="network-badge" style={{ backgroundColor: getNetworkStatusColor() }}>
            {getCurrentNetwork().name}
          </span>
        </div>
      )}
    </nav>
  );

  // 渲染钱包页面
  const renderWalletPage = () => (
    <div className="page-content">
      {!checkMetaMaskInstalled() ? (
        <div className="wallet-section">
          <h2>❌ 未检测到MetaMask</h2>
          <p>请安装MetaMask钱包扩展程序来使用此应用</p>
          <a 
            href="https://metamask.io/download/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="install-button"
          >
            安装 MetaMask
          </a>
        </div>
      ) : !account ? (
        <div className="wallet-section">
          <h2>🔗 连接您的钱包</h2>
          <p>连接您的MetaMask钱包到BSC主网开始使用</p>
          <button 
            onClick={connectWallet} 
            disabled={isConnecting}
            className="connect-button"
          >
            {isConnecting ? '连接中...' : '连接 MetaMask'}
          </button>
        </div>
      ) : (
        <div className="wallet-section">
          <h2>✅ 钱包已连接</h2>
          <div className="wallet-info">
            <div className="info-item">
              <span className="label">账户地址:</span>
              <span className="value">{formatAddress(account)}</span>
            </div>
            <div className="info-item">
              <span className="label">当前网络:</span>
              <span 
                className="value" 
                style={{ color: getNetworkStatusColor() }}
              >
                {getCurrentNetwork().name}
              </span>
            </div>
            <div className="info-item">
              <span className="label">余额:</span>
              <span className="value">
                {parseFloat(balance).toFixed(4)} {getCurrentNetwork().symbol}
              </span>
            </div>
          </div>
          
          {/* BSC主网状态显示 */}
          {chainId !== BSC_MAINNET.chainId && (
            <div className="network-warning">
              <h3>⚠️ 网络提示</h3>
              <p>此应用仅支持BSC主网，请切换到BSC主网以正常使用所有功能。</p>
              <button 
                onClick={switchToBSC}
                disabled={isSwitchingNetwork}
                className="switch-network-button"
              >
                {isSwitchingNetwork ? '切换中...' : '切换到BSC主网'}
              </button>
            </div>
          )}
          
          <button 
            onClick={disconnectWallet}
            className="disconnect-button"
          >
            断开连接
          </button>
        </div>
      )}
      
      <div className="features-section">
        <h3>🚀 支持的功能</h3>
        <ul>
          <li>✅ BSC主网钱包连接</li>
          <li>✅ 自动网络检测和切换</li>
          <li>✅ 实时余额显示</li>
          <li>✅ USDT/BR固定交易功能</li>
          <li>✅ 自动循环交易功能</li>
          <li>✅ 智能价格计算</li>
          <li>✅ PancakeSwap V3 集成</li>
          <li>✅ 交易历史记录</li>
        </ul>
      </div>
    </div>
  );



  // 渲染固定交易页面
  const renderFixedTradePage = () => (
    <div className="page-content">
      <FixedTrade 
        account={account}
        provider={provider}
        chainId={chainId}
      />
    </div>
  );

  // 渲染循环交易页面
  const renderCycleTradingPage = () => (
    <div className="page-content">
      <CycleTrading 
        account={account}
        provider={provider}
        chainId={chainId}
      />
    </div>
  );

  return (
    <div className="App">
      {renderNavigation()}
      <main className="main-content">
        {currentPage === 'wallet' && renderWalletPage()}
        {currentPage === 'fixed' && renderFixedTradePage()}
        {currentPage === 'cycle' && renderCycleTradingPage()}
      </main>
    </div>
  );
}

export default App;
