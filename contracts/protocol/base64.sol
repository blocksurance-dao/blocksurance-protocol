// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/// [MIT License]
/// @title Base64
/// @notice Provides a function for encoding some bytes in base64
/// @author Brecht Devos <brecht@loopring.org>
library Base64 {
    /// @notice Encodes some bytes to the base64 representation
    uint256 constant SECONDS_PER_DAY = 24 * 60 * 60;
    int256 constant OFFSET19700101 = 2440588;
    string internal constant TABLE =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    function encode(bytes memory data) internal pure returns (string memory) {
        if (data.length == 0) return "";

        // load the table into memory
        string memory table = TABLE;

        // multiply by 4/3 rounded up
        uint256 encodedLen = 4 * ((data.length + 2) / 3);

        // add some extra buffer at the end required for the writing
        string memory result = new string(encodedLen + 32);

        assembly {
            // set the actual output length
            mstore(result, encodedLen)

            // prepare the lookup table
            let tablePtr := add(table, 1)

            // input ptr
            let dataPtr := data
            let endPtr := add(dataPtr, mload(data))

            // result ptr, jump over length
            let resultPtr := add(result, 32)

            // run over the input, 3 bytes at a time
            for {

            } lt(dataPtr, endPtr) {

            } {
                dataPtr := add(dataPtr, 3)

                // read 3 bytes
                let input := mload(dataPtr)

                // write 4 characters
                mstore(resultPtr, shl(248, mload(add(tablePtr, and(shr(18, input), 0x3F)))))
                resultPtr := add(resultPtr, 1)
                mstore(resultPtr, shl(248, mload(add(tablePtr, and(shr(12, input), 0x3F)))))
                resultPtr := add(resultPtr, 1)
                mstore(resultPtr, shl(248, mload(add(tablePtr, and(shr(6, input), 0x3F)))))
                resultPtr := add(resultPtr, 1)
                mstore(resultPtr, shl(248, mload(add(tablePtr, and(input, 0x3F)))))
                resultPtr := add(resultPtr, 1)
            }

            // padding with '='
            switch mod(mload(data), 3)
            case 1 {
                mstore(sub(resultPtr, 2), shl(240, 0x3d3d))
            }
            case 2 {
                mstore(sub(resultPtr, 1), shl(248, 0x3d))
            }
        }

        return result;
    }

    function formatTokenURI(
        string memory name,
        string memory description,
        string memory attributes,
        string memory imageURI
    ) internal pure returns (string memory) {
        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    encode(
                        bytes(
                            abi.encodePacked(
                                '{"name":"',
                                name,
                                '", "description": "',
                                description,
                                '"',
                                ', "attributes": ',
                                attributes,
                                ', "image":"',
                                imageURI,
                                '"}'
                            )
                        )
                    )
                )
            );
    }

    function getStringPrice(
        uint256 price,
        uint64 baseDecimals
    ) internal pure returns (string memory ret) {
        uint256 value = price / uint256(1 * 10 ** (baseDecimals - 2));
        if (value < 1) return "0.00";
        string memory strValue = toString(value);

        uint256 _len = length(strValue);
        if (_len == 2) {
            strValue = concat("0", strValue);
            _len = length(strValue);
        } else if (_len == 1) {
            strValue = concat("00", strValue);
            _len = length(strValue);
        }
        string memory _back = getSlice(_len - 1, _len, strValue);
        string memory _front = getSlice(1, uint256(_len - 2), strValue);
        string memory format = _stringFormat(_front);
        ret = concat(concat(format, "."), _back);
    }

    function concat(string memory base, string memory value) internal pure returns (string memory) {
        return string(abi.encodePacked(base, value));
    }

    function getSlice(
        uint256 begin,
        uint256 end,
        string memory text
    ) internal pure returns (string memory) {
        bytes memory a = new bytes(end - begin + 1);
        for (uint256 i = 0; i <= end - begin; i++) {
            a[i] = bytes(text)[i + begin - 1];
        }
        return string(a);
    }

    /**
     * Length
     *
     * Returns the length of the specified string
     *
     * @param base When being used for a data type this is the extended object
     *              otherwise this is the string to be measured
     * @return uint The length of the passed string
     */
    function length(string memory base) internal pure returns (uint256) {
        bytes memory _baseBytes = bytes(base);
        return _baseBytes.length;
    }

    function toString(uint256 value) internal pure returns (string memory) {
        // Inspired by OraclizeAPI's implementation - MIT licence
        // https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol

        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function timestampToDate(uint256 timestamp) internal pure returns (string memory) {
        (uint256 year, uint256 month, uint256 day) = _daysToDate(timestamp / SECONDS_PER_DAY);
        string memory _date = concat(
            concat(concat(toString(day), "."), concat(toString(month), ".")),
            toString(year)
        );
        return _date;
    }

    function _daysToDate(
        uint256 numDays
    ) internal pure returns (uint256 year, uint256 month, uint256 day) {
        int256 __days = int256(numDays);

        int256 L = __days + 68569 + OFFSET19700101;
        int256 N = (4 * L) / 146097;
        int256 O = L - (146097 * N + 3) / 4;
        int256 _year = (4000 * (O + 1)) / 1461001;
        int256 P = O - (1461 * _year) / 4 + 31;
        int256 _month = (80 * P) / 2447;
        int256 _day = P - (2447 * _month) / 80;
        int256 Q = _month / 11;
        _month = _month + 2 - 12 * Q;
        _year = 100 * (N - 49) + _year + Q;

        year = uint256(_year);
        month = uint256(_month);
        day = uint256(_day);
    }

    function addressToString(bytes memory data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";

        bytes memory str = new bytes(2 + data.length * 2);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < data.length; i++) {
            str[2 + i * 2] = alphabet[uint256(uint8(data[i] >> 4))];
            str[3 + i * 2] = alphabet[uint256(uint8(data[i] & 0x0f))];
        }
        return string(str);
    }

    function _stringFormat(string memory data) internal pure returns (string memory ret) {
        bytes memory _stringBytes = bytes(data);
        uint i = _stringBytes.length;

        while (i > 0) {
            if ((_stringBytes.length + 1 - i) % 3 == 0 && i != 1) {
                ret = concat(concat(",", string(abi.encodePacked(_stringBytes[i - 1]))), ret);
            } else {
                ret = concat(string(abi.encodePacked(_stringBytes[i - 1])), ret);
            }
            i--;
        }
    }
}
