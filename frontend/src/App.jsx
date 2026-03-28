import { useState } from 'react';
import RepoInput from './components/RepoInput';
import FlowViewer from './components/FlowViewer';
import StatsBar from './components/StatsBar';

const MOCK_FLOWS = {
  login: {
    root: 0,
    nodes: [
      { id: 0,  label: 'handleSubmit',            type: 'event',    file: 'LoginForm.jsx',                  line: 18  },
      { id: 1,  label: 'validateCredentials',     type: 'function', file: 'auth/utils.js',                  line: 7   },
      { id: 2,  label: 'sanitizeInput',           type: 'function', file: 'auth/utils.js',                  line: 34  },
      { id: 3,  label: 'checkRateLimit',          type: 'function', file: 'auth/rateLimit.js',              line: 12  },
      { id: 4,  label: 'loginUser',               type: 'function', file: 'auth/api.js',                    line: 23  },
      { id: 5,  label: "navigate('/dashboard')",  type: 'function', file: 'LoginForm.jsx',                  line: 31  },
      { id: 6,  label: 'POST /api/auth/login',    type: 'api',      file: 'routes/auth.js',                 line: 1   },
      { id: 7,  label: 'authController.login',    type: 'function', file: 'controllers/authController.js',  line: 55  },
      { id: 8,  label: 'UserService.findByEmail', type: 'function', file: 'services/userService.js',        line: 12  },
      { id: 9,  label: 'bcrypt.compare',          type: 'function', file: 'services/userService.js',        line: 19  },
      { id: 10, label: 'jwt.sign',                type: 'function', file: 'services/authService.js',        line: 8   },
      { id: 11, label: 'SessionService.create',   type: 'function', file: 'services/sessionService.js',     line: 22  },
      { id: 12, label: 'AuditLog.write',          type: 'function', file: 'services/auditService.js',       line: 5   },
      { id: 13, label: 'res.json({token,user})',  type: 'response', file: 'controllers/authController.js',  line: 78  },
    ],
    edges: [
      { from: 0,  to: 1,  label: 'validate'   },
      { from: 0,  to: 4,  label: 'call'       },
      { from: 0,  to: 5,  label: 'after login'},
      { from: 1,  to: 2,  label: 'sanitize'   },
      { from: 1,  to: 3,  label: 'rate limit' },
      { from: 4,  to: 6,  label: 'HTTP'       },
      { from: 6,  to: 7,  label: 'route'      },
      { from: 7,  to: 8,  label: 'lookup'     },
      { from: 7,  to: 12, label: 'audit'      },
      { from: 7,  to: 13, label: 'return'     },
      { from: 8,  to: 9,  label: 'verify pwd' },
      { from: 8,  to: 10, label: 'sign token' },
      { from: 8,  to: 11, label: 'session'    },
    ],
  },

  checkout: {
    root: 0,
    nodes: [
      { id: 0,  label: 'handleCheckout',           type: 'event',    file: 'Checkout.jsx',                   line: 54  },
      { id: 1,  label: 'validateCart',             type: 'function', file: 'cart/utils.js',                  line: 3   },
      { id: 2,  label: 'checkStockAvailability',   type: 'function', file: 'cart/stockCheck.js',             line: 18  },
      { id: 3,  label: 'applyDiscountCodes',       type: 'function', file: 'cart/discounts.js',              line: 45  },
      { id: 4,  label: 'calculateTax',             type: 'function', file: 'cart/tax.js',                    line: 9   },
      { id: 5,  label: 'POST /api/orders',         type: 'api',      file: 'routes/orders.js',               line: 1   },
      { id: 6,  label: "navigate('/confirm')",     type: 'function', file: 'Checkout.jsx',                   line: 72  },
      { id: 7,  label: 'OrderController.create',   type: 'function', file: 'controllers/orderController.js', line: 11  },
      { id: 8,  label: 'OrderService.create',      type: 'function', file: 'services/orderService.js',       line: 22  },
      { id: 9,  label: 'PaymentService.charge',    type: 'function', file: 'services/paymentService.js',     line: 8   },
      { id: 10, label: 'InventoryService.deduct',  type: 'function', file: 'services/inventoryService.js',   line: 15  },
      { id: 11, label: 'NotificationService.send', type: 'function', file: 'services/notificationService.js',line: 30  },
      { id: 12, label: 'stripe.paymentIntents',    type: 'function', file: 'lib/stripe.js',                  line: 14  },
      { id: 13, label: 'stripe.confirm',           type: 'function', file: 'lib/stripe.js',                  line: 28  },
      { id: 14, label: 'Product.updateStock',      type: 'function', file: 'models/Product.js',              line: 67  },
      { id: 15, label: 'EmailService.send',        type: 'function', file: 'services/emailService.js',       line: 12  },
      { id: 16, label: 'SMSService.send',          type: 'function', file: 'services/smsService.js',         line: 8   },
      { id: 17, label: 'res.json({orderId})',      type: 'response', file: 'controllers/orderController.js', line: 45  },
    ],
    edges: [
      { from: 0,  to: 1,  label: 'validate'  },
      { from: 0,  to: 5,  label: 'HTTP'      },
      { from: 0,  to: 6,  label: 'on success'},
      { from: 1,  to: 2,  label: 'stock'     },
      { from: 1,  to: 3,  label: 'discounts' },
      { from: 1,  to: 4,  label: 'tax'       },
      { from: 5,  to: 7,  label: 'route'     },
      { from: 7,  to: 8,  label: 'delegate'  },
      { from: 8,  to: 9,  label: 'charge'    },
      { from: 8,  to: 10, label: 'deduct'    },
      { from: 8,  to: 11, label: 'notify'    },
      { from: 8,  to: 17, label: 'return'    },
      { from: 9,  to: 12, label: 'intent'    },
      { from: 9,  to: 13, label: 'confirm'   },
      { from: 10, to: 14, label: 'update'    },
      { from: 11, to: 15, label: 'email'     },
      { from: 11, to: 16, label: 'sms'       },
    ],
  },

  search: {
    root: 0,
    nodes: [
      { id: 0,  label: 'handleSearch',            type: 'event',    file: 'SearchBar.jsx',                   line: 14  },
      { id: 1,  label: 'debounce',                type: 'function', file: 'hooks/useSearch.js',              line: 5   },
      { id: 2,  label: 'buildQueryParams',        type: 'function', file: 'hooks/useSearch.js',              line: 22  },
      { id: 3,  label: 'GET /api/search',         type: 'api',      file: 'routes/search.js',               line: 1   },
      { id: 4,  label: 'setResults',              type: 'function', file: 'SearchBar.jsx',                   line: 22  },
      { id: 5,  label: 'updateURLParams',         type: 'function', file: 'SearchBar.jsx',                   line: 35  },
      { id: 6,  label: 'SearchController.query',  type: 'function', file: 'controllers/searchController.js', line: 8   },
      { id: 7,  label: 'SearchService.query',     type: 'function', file: 'services/searchService.js',       line: 18  },
      { id: 8,  label: 'FilterService.apply',     type: 'function', file: 'services/filterService.js',       line: 6   },
      { id: 9,  label: 'SortService.apply',       type: 'function', file: 'services/sortService.js',         line: 11  },
      { id: 10, label: 'CacheService.get',        type: 'function', file: 'services/cacheService.js',        line: 4   },
      { id: 11, label: 'db.collection.find',      type: 'function', file: 'models/Product.js',              line: 34  },
      { id: 12, label: 'db.collection.aggregate', type: 'function', file: 'models/Product.js',              line: 58  },
      { id: 13, label: 'ElasticSearch.query',     type: 'function', file: 'lib/elastic.js',                 line: 20  },
      { id: 14, label: 'AnalyticsService.track',  type: 'function', file: 'services/analyticsService.js',    line: 9   },
      { id: 15, label: 'CacheService.set',        type: 'function', file: 'services/cacheService.js',        line: 18  },
      { id: 16, label: 'res.json({results})',     type: 'response', file: 'controllers/searchController.js', line: 27  },
    ],
    edges: [
      { from: 0,  to: 1,  label: 'debounce'    },
      { from: 0,  to: 3,  label: 'fetch'       },
      { from: 0,  to: 4,  label: 'update state'},
      { from: 0,  to: 5,  label: 'sync URL'    },
      { from: 1,  to: 2,  label: 'build params'},
      { from: 3,  to: 6,  label: 'route'       },
      { from: 6,  to: 7,  label: 'delegate'    },
      { from: 6,  to: 14, label: 'track'       },
      { from: 7,  to: 8,  label: 'filter'      },
      { from: 7,  to: 9,  label: 'sort'        },
      { from: 7,  to: 10, label: 'cache check' },
      { from: 7,  to: 16, label: 'return'      },
      { from: 8,  to: 11, label: 'query DB'    },
      { from: 8,  to: 13, label: 'elastic'     },
      { from: 9,  to: 12, label: 'aggregate'   },
      { from: 10, to: 15, label: 'cache set'   },
    ],
  },
};

function resolveFlowKey(url, fnText) {
  const combined = (url + fnText).toLowerCase();
  if (combined.includes('shop') || combined.includes('checkout') || combined.includes('order')) return 'checkout';
  if (combined.includes('search')) return 'search';
  return 'login';
}

function App() {
  const [flow, setFlow]       = useState(null);
  const [loading, setLoading] = useState(false);

  // 1. Make the function async
 const handleAnalyze = async (url, fnText) => {
    setFlow(null);
    setLoading(true);
    const key = forcedKey || resolveFlowKey(url, fnText);
    setTimeout(() => {
      setFlow(MOCK_FLOWS[key] || MOCK_FLOWS.login);
      setLoading(false);
    }, 900);
  };

  return (
    <div className="app-shell">
      <div className="orb orb-purple" />
      <div className="orb orb-blue" />
      <div className="orb orb-green" />
      <div className="grid-overlay" />

      <div className="content-wrap">
        <header className="app-header">
          <div className="badge">⬡ Static AST Analysis Engine</div>
          <h1 className="app-title">
            <span className="title-accent">SHINKEI</span>
          </h1>
          <p className="app-kanji">神経 / Tree Call Graph Visualizer</p>
          <p className="app-subtitle">
            Trace every execution path from your entry function to all reachable calls.
            Zero runtime overhead.
          </p>
        </header>

        <main className="app-main">
          <RepoInput onAnalyze={handleAnalyze} loading={loading} />
          {flow && !loading && <StatsBar flow={flow.nodes} />}
        </main>
      </div>

      {/* FlowViewer always sits inside the normal centered column.
          FlowGraph breaks out to 100vw on its own via CSS — App never widens. */}
      {(flow || loading) && (
        <div style={{
          maxWidth: '720px',
          margin: '0 auto',
          width: '100%',
          padding: '0 24px',
        }}>
          <FlowViewer
            flowData={flow ? flow.nodes : null}
            graphData={flow}
            loading={loading}
          />
        </div>
      )}
    </div>
  );
}

export default App;