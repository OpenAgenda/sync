'use strict';

module.exports = function axiosErrorInterceptor(error) {
  if (error.isAxiosError) {
    const toJSON = error.toJSON.bind(error);
    error.toJSON = function() {
      return {
        ...toJSON(),
        response: this.response
          ? {
            status: this.response.status,
            statusText: this.response.statusText,
            headers: this.response.headers,
            data: this.response.data,
          }
          : undefined,
      };
    };
  }
  return Promise.reject(error);
};
