import domdomegg from 'eslint-config-domdomegg';

export default [
	...domdomegg,
	{
		rules: {
			'no-cond-assign': 'off',
			'no-continue': 'off',
			'new-cap': 'off',
		},
	},
];
