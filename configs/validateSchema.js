module.exports = {
  postPayment: {
    content: {
      required: true,
      isLength: [4, 150]
    },
    amount: {
      required: true,
      isLength: [1, 150]
    },
    accountNumber: {
      required: true,
      isLength: [2, 50]
    },
    customPaymentID: {
      default: "1"
    }
  },
  getPayment: {
    paymentID: {
      required: true,
      isLength: [1, 255]
    }
  },
  customGetPayment: {
    customPaymentID: {
      required: true,
      isLength: [1, 255]
    }
  },
  getLoginStatus: {
    accountNumber: {
      required: true,
      isLength: [4, 255]
    }
  },
  postBank: {
    accountNumber: {
      required: true,
      isLength: [4, 255]
    },
    username: {
      required: true,
      isLength: [1, 255]
    },
    password: {
      required: true,
      isLength: [1, 255]
    },
    cardHolderName: {
      default: 'Unknown'
    }
  },
  putBank: {
    accountNumber: {
      required: true,
      isLength: [4, 255]
    }
  },
  getTransactions: {
    from: {
      required: true,
      isLength: [2, 255]
    },
    to: {
      required: true,
      isLength: [2, 255]
    },
    accountNumber: {
      default: 'all'
    }
  }
};
